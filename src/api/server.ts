import { timingSafeEqual } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { convertSvg } from '../core/convert'
import { parseSettingsFile } from '../core/settingsFile'
import type { SettingsBundle } from '../core/settingsFile'
import {
  uploadGcodeToMoonraker,
  type MoonrakerUploadOptions,
} from '../app/downloadFile'

const MAX_BODY_BYTES = 2 * 1024 * 1024
const DEFAULT_CONFIG_PATH = '/usr/local/share/path2plot/defaults.json'
const DEFAULT_MOONRAKER_URL = 'http://127.0.0.1:7125'
const API_PREFIX = '/path2plot/api/v1/'

export type ApiUpload = (
  text: string,
  fileName: string,
  options: MoonrakerUploadOptions,
) => ReturnType<typeof uploadGcodeToMoonraker>

export interface ApiServerOptions {
  token?: string
  origins?: string[]
  defaultConfigPath?: string
  moonrakerBaseUrl?: string
  upload?: ApiUpload
}

type Payload = {
  svg?: unknown
  fileName?: unknown
  overwrite?: unknown
  config?: unknown
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    ...headers,
  })
  res.end(text)
}

function bearerMatches(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) return false
  const provided = Buffer.from(header.slice(7))
  const secret = Buffer.from(expected)
  return provided.length === secret.length && timingSafeEqual(provided, secret)
}

function isSameHostOrigin(
  origin: string,
  host: string | undefined,
  forwardedProto: string | undefined,
  encrypted: boolean,
): boolean {
  if (!host) return false
  try {
    const url = new URL(origin)
    const scheme =
      forwardedProto?.split(',')[0]?.trim().toLowerCase() ??
      (encrypted ? 'https' : 'http')
    return (
      url.host.toLowerCase() === host.toLowerCase() &&
      url.protocol === `${scheme}:`
    )
  } catch {
    return false
  }
}

async function readJson(req: IncomingMessage): Promise<Payload> {
  const chunks: Buffer[] = []
  let size = 0
  const iterator = req.iterator({ destroyOnReturn: false })
  for await (const chunk of iterator) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      req.resume()
      throw Object.assign(new Error('body-too-large'), { statusCode: 413 })
    }
    chunks.push(buffer)
  }
  let value: unknown
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('invalid-json'), { statusCode: 400 })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Object.assign(new Error('invalid-json'), { statusCode: 400 })
  return value as Payload
}

function validFileName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    value === value.trim() &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/]/.test(value) &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    }) &&
    value.toLowerCase().endsWith('.gcode')
  )
}

export function createApiServer(options: ApiServerOptions = {}): Server {
  const token = options.token ?? process.env.PATH2PLOT_API_TOKEN ?? ''
  const allowedOrigins = new Set(
    options.origins ??
      (process.env.PATH2PLOT_API_ORIGINS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
  )
  const upload = options.upload ?? uploadGcodeToMoonraker
  const configPath = options.defaultConfigPath ?? DEFAULT_CONFIG_PATH
  const moonrakerBaseUrl = options.moonrakerBaseUrl ?? DEFAULT_MOONRAKER_URL
  const activeNames = new Set<string>()

  return createServer(async (req, res) => {
    const origin = req.headers.origin
    let cors: Record<string, string> = {}
    if (origin) {
      const forwardedProto = req.headers['x-forwarded-proto']
      const permitted =
        allowedOrigins.has(origin) ||
        isSameHostOrigin(
          origin,
          req.headers.host,
          Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto,
          false,
        )
      if (!permitted) return send(res, 403, { error: 'Origin is not allowed' })
      cors = {
        'access-control-allow-origin': origin,
        vary: 'Origin',
        'access-control-allow-headers': 'Authorization, Content-Type',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      }
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      return res.end()
    }
    const path = req.url?.split('?')[0] ?? ''
    if (req.method === 'GET' && path === `${API_PREFIX}health`)
      return send(res, 200, { status: 'ok' }, cors)
    if (
      req.method !== 'POST' ||
      !['convert', 'save', 'print'].some(
        (action) => path === `${API_PREFIX}${action}`,
      )
    )
      return send(res, 404, { error: 'Not found' }, cors)
    if (token && !bearerMatches(req.headers.authorization, token))
      return send(res, 401, { error: 'Unauthorized' }, cors)
    if (
      !/^application\/json(?:\s*;|\s*$)/i.test(
        req.headers['content-type'] ?? '',
      )
    )
      return send(
        res,
        415,
        { error: 'Content-Type must be application/json' },
        cors,
      )

    let body: Payload
    try {
      body = await readJson(req)
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 400
      return send(
        res,
        status,
        {
          error:
            status === 413 ? 'Request body exceeds 2 MiB' : 'Invalid JSON body',
        },
        cors,
      )
    }
    if (typeof body.svg !== 'string' || !body.svg.trim())
      return send(res, 400, { error: 'svg must be a non-empty string' }, cors)
    const action = path.slice(API_PREFIX.length)
    if (action !== 'convert' && !validFileName(body.fileName))
      return send(
        res,
        400,
        { error: 'fileName must be a basename ending in .gcode' },
        cors,
      )
    if (
      action !== 'convert' &&
      body.overwrite !== undefined &&
      typeof body.overwrite !== 'boolean'
    )
      return send(res, 400, { error: 'overwrite must be a boolean' }, cors)

    let settings: SettingsBundle
    try {
      settings =
        body.config === undefined
          ? parseSettingsFile(await readFile(configPath, 'utf8'))
          : parseSettingsFile(JSON.stringify(body.config))
    } catch {
      return send(
        res,
        422,
        { error: 'Invalid or unavailable settings configuration' },
        cors,
      )
    }
    let gcode: string
    try {
      gcode = convertSvg(body.svg, settings)
    } catch (error) {
      return send(
        res,
        422,
        {
          error:
            error instanceof Error ? error.message : 'SVG conversion failed',
        },
        cors,
      )
    }
    if (action === 'convert') {
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': Buffer.byteLength(gcode),
        ...cors,
      })
      return res.end(gcode)
    }

    const fileName = body.fileName as string
    if (activeNames.has(fileName))
      return send(
        res,
        409,
        { error: 'An operation for this file is already in progress' },
        cors,
      )
    activeNames.add(fileName)
    try {
      const result = await upload(gcode, fileName, {
        baseUrl: moonrakerBaseUrl,
        print: action === 'print',
        overwrite: body.overwrite === true,
        confirmOverwrite: () => false,
      })
      if (!result.saved)
        return send(res, 409, { error: 'File already exists', fileName }, cors)
      return send(res, 200, { fileName, printStatus: result.printStatus }, cors)
    } catch {
      return send(res, 502, { error: 'Moonraker request failed' }, cors)
    } finally {
      activeNames.delete(fileName)
    }
  })
}

const executedPath = process.argv[1]
if (
  executedPath &&
  import.meta.url === pathToFileURL(resolve(executedPath)).href
) {
  const port = Number(process.env.PATH2PLOT_API_PORT ?? 8787)
  createApiServer().listen(port, '127.0.0.1')
}
