import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApiServer } from '../api/server'

const token = 'test-token'
const origin = 'https://drawing.example'
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path stroke="black" d="M1 2 L8 9"/></svg>'
const config = { schemaVersion: 1, settings: {} }
const upload = vi.fn()
let server: ReturnType<typeof createApiServer> | undefined
let directory: string | undefined
let baseUrl: string

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'path2plot-api-'))
  const defaultConfigPath = join(directory, 'defaults.json')
  await writeFile(
    defaultConfigPath,
    JSON.stringify({
      ...config,
      settings: { gcodeSettings: { drawFeedRate: 1234 } },
    }),
  )
  server = createApiServer({
    token,
    origins: [origin],
    defaultConfigPath,
    upload,
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('テストサーバーが起動しませんでした')
  baseUrl = `http://127.0.0.1:${address.port}/path2plot/api/v1`
})

afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()))
  if (directory) await rm(directory, { recursive: true, force: true })
})

function post(
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${baseUrl}/${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('Pi HTTP API', () => {
  it('トークン未設定では認証ヘッダーなしで変換できる', async () => {
    const local = createApiServer({ token: '', upload })
    await new Promise<void>((resolve) => local.listen(0, '127.0.0.1', resolve))
    try {
      const address = local.address()
      if (!address || typeof address === 'string')
        throw new Error('テストサーバーが起動しませんでした')
      const response = await fetch(
        `http://127.0.0.1:${address.port}/path2plot/api/v1/convert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ svg, config }),
        },
      )
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('PLOT_START')
    } finally {
      await new Promise<void>((resolve) => local.close(() => resolve()))
    }
  })

  it('稼働確認、認証、ブラウザのオリジン制限を適用する', async () => {
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
    expect(
      (await post('convert', { svg }, { Authorization: 'Bearer wrong' }))
        .status,
    ).toBe(401)
    const preflight = await fetch(`${baseUrl}/print`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(origin)
    expect(
      (
        await post(
          'print',
          { svg, fileName: 'test.gcode' },
          { Origin: 'https://other.example' },
        )
      ).status,
    ).toBe(403)
    expect(upload).not.toHaveBeenCalled()
  })

  it('Piの共有設定を使い、指定があれば設定JSONで変換する', async () => {
    const defaults = await post('convert', { svg })
    expect(defaults.status).toBe(200)
    expect(defaults.headers.get('content-type')).toContain('text/plain')
    expect(await defaults.text()).toContain('F1234')
    const override = await post('convert', { svg, config })
    expect(await override.text()).toContain('F24000')
    expect(upload).not.toHaveBeenCalled()
  })

  it('無効な設定やファイル名、サイズ超過を送信前に拒否する', async () => {
    expect((await post('convert', { svg, config: null })).status).toBe(422)
    expect(
      (await post('save', { svg, fileName: '../test.gcode' })).status,
    ).toBe(400)
    expect(
      (await post('convert', { svg: 'a'.repeat(2 * 1024 * 1024) })).status,
    ).toBe(413)
    expect(upload).not.toHaveBeenCalled()
  })

  it('保存と印刷を区別し、上書き指定を渡す', async () => {
    upload.mockResolvedValueOnce({ saved: true, printStatus: 'not_requested' })
    upload.mockResolvedValueOnce({ saved: true, printStatus: 'queued' })
    const body = { svg, fileName: 'test.gcode' }
    const saved = await post('save', body)
    expect(saved.ok).toBe(true)
    expect(await saved.json()).toMatchObject({
      fileName: 'test.gcode',
      printStatus: 'not_requested',
    })
    const printed = await post('print', { ...body, overwrite: true })
    expect(printed.ok).toBe(true)
    expect(await printed.json()).toMatchObject({
      fileName: 'test.gcode',
      printStatus: 'queued',
    })
    expect(upload).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('PLOT_START'),
      'test.gcode',
      expect.objectContaining({ print: false, overwrite: false }),
    )
    expect(upload).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('PLOT_START'),
      'test.gcode',
      expect.objectContaining({ print: true, overwrite: true }),
    )
  })

  it('同名とMoonraker通信失敗を区別する', async () => {
    upload.mockResolvedValueOnce({ saved: false })
    upload.mockRejectedValueOnce(new Error('connection lost'))
    const body = { svg, fileName: 'test.gcode' }
    expect((await post('save', body)).status).toBe(409)
    expect((await post('print', body)).status).toBe(502)
  })

  it('同じファイルの処理中に重複した印刷要求を送らない', async () => {
    let finish!: () => void
    let started!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const uploading = new Promise<void>((resolve) => {
      started = resolve
    })
    upload.mockImplementationOnce(async () => {
      started()
      await pending
      return { saved: true, printStatus: 'started' }
    })
    const body = { svg, fileName: 'in-progress.gcode' }
    const first = post('print', body)
    try {
      await uploading
      expect((await post('print', body)).status).toBe(409)
    } finally {
      finish()
    }
    expect(await (await first).json()).toMatchObject({ printStatus: 'started' })
  })
})
