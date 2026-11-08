import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFillBlocks } from './fill/fillBlock'
import { generateGcode } from './gcode/generate'
import { buildDrawPlan } from './plan/drawPlan'
import { toDrawUnits } from './plan/drawUnit'
import { configuredDrawOrder } from './plan/optimizeOrder'
import { buildJoinedBlocks } from './plan/strokeJoin'
import { createDefaultSettings, serializeSettingsFile } from './settingsFile'
import { parseSvgFile } from './svg/parseSvgFile'

const run = promisify(execFile)
let directory: string
const cli = (...args: string[]) =>
  run(process.execPath, [join(directory, 'path2plot-cli.mjs'), ...args], {
    cwd: directory,
  })

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'path2plot-cli-'))
  await run(process.execPath, ['scripts/build-cli.mjs', directory])
}, 30_000)

afterAll(async () => {
  if (directory) await rm(directory, { force: true, recursive: true })
})

const svg = (content: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${content}</svg>`

function conversionSettings() {
  const settings = createDefaultSettings()
  settings.parseSettings.dpi = 25.4
  settings.gcodeSettings.flipY = false
  settings.gcodeSettings.bedOriginXMm = 0
  settings.gcodeSettings.bedOriginYMm = 0
  return settings
}

async function prepare(
  name: string,
  input: string,
  config = serializeSettingsFile(conversionSettings()),
) {
  const inputFile = `${name}.svg`
  const configFile = `${name}.json`
  const outputFile = `${name}.gcode`
  await Promise.all([
    writeFile(join(directory, inputFile), input, 'utf8'),
    writeFile(join(directory, configFile), config, 'utf8'),
  ])
  return {
    args: [
      '--input',
      inputFile,
      '--output',
      outputFile,
      '--config',
      configFile,
    ],
    output: join(directory, outputFile),
  }
}

describe('Node CLI', () => {
  it('ヘルプ・バージョンを表示し、必須オプションを検証する', async () => {
    expect((await cli('--help')).stdout).toContain('--config')
    expect((await cli('--version')).stdout).toMatch(/^\d+\.\d+\.\d+/)
    await expect(cli('--input', 'input.svg')).rejects.toMatchObject({
      code: 1,
      stdout: '',
      stderr: expect.stringContaining('--output'),
    })
  })

  it('単一のパスを変換し、計測はstderrに出力して既存ファイルを保持する', async () => {
    const { args, output } = await prepare(
      'single',
      svg('<path stroke="black" d="M1 2 L3 4"/>'),
    )
    const result = await cli(...args, '--timing')
    expect(result.stdout).toBe('')
    expect(result.stderr).toMatch(
      /SVG読み込み.*\n.*SVG解析.*\n.*パス処理.*\n.*G-code生成.*\n.*合計/,
    )
    const gcode = await readFile(output, 'utf8')
    expect(gcode).toContain('G0 X1 Y8')
    expect(gcode).toContain('PEN_DOWN')
    expect(gcode).toContain('G1 X3 Y6')
    expect(gcode.endsWith('PLOT_END\n')).toBe(true)
    await expect(cli(...args)).rejects.toMatchObject({
      code: 1,
      stdout: '',
      stderr: expect.stringContaining('既に存在'),
    })
    expect(await readFile(output, 'utf8')).toBe(gcode)
  })

  it('最適化の一括無効時は個別フラグに関係なくSVGの順序と方向を保持する', async () => {
    const settings = conversionSettings()
    settings.pathOptions = {
      optimizePaths: false,
      optimizeTravel: true,
      reorderPaths: true,
      reversePaths: true,
      joinPaths: true,
    }
    const input = svg(
      '<path stroke="black" d="M9 8 L7 8 M2 9 L1 9"/><line stroke="black" x1="4" y1="8" x2="3" y2="8"/>',
    )
    const { args, output } = await prepare(
      'ordered',
      input,
      serializeSettingsFile(settings),
    )
    expect((await cli(...args)).stderr).toBe('')
    expect((await readFile(output, 'utf8')).match(/^G[01] .+$/gm)).toEqual([
      'G0 X9 Y2 F24000',
      'G1 X7 Y2 F24000',
      'G0 X2 Y1 F24000',
      'G1 X1 Y1 F24000',
      'G0 X4 Y2 F24000',
      'G1 X3 Y2 F24000',
    ])
  })

  it('Web UIで用いるDrawPlanと同一のG-codeを生成する', async () => {
    const settings = conversionSettings()
    settings.pathOptions.joinPaths = true
    settings.pathOptions.reorderPaths = true
    settings.pathOptions.reversePaths = true
    const input = svg(
      '<path stroke="black" d="M7 8 L9 8 M4 8 L7 8"/><rect x="1" y="1" width="2" height="3"/>',
    )
    const { args, output } = await prepare(
      'shared',
      input,
      serializeSettingsFile(settings),
    )
    await cli(...args)
    const parsed = parseSvgFile(input, settings.parseSettings)
    const blocks = buildJoinedBlocks(
      parsed.strokes,
      settings.joinDistanceMm,
      new Map(),
    )
    const fills = buildFillBlocks(
      parsed.fillCandidates,
      settings.fillSettings,
      new Map(),
    )
    const units = toDrawUnits(blocks, fills)
    const order = configuredDrawOrder(
      units,
      parsed.strokes,
      settings.pathOptions,
    )
    const plan = buildDrawPlan(
      units,
      parsed.strokes,
      order,
      new Map(),
      new Set(),
    )
    expect(await readFile(output, 'utf8')).toBe(
      generateGcode(plan.drawGroups, settings.gcodeSettings),
    )
  })

  it.each([
    ['malformed', '<svg><g></svg>', undefined, 'SVG解析エラー'],
    ['not-svg', '<xml/>', undefined, 'ルート要素'],
    [
      'bad-path',
      svg('<path stroke="black" d="M1 2 L3"/>'),
      undefined,
      'パスの数値解析',
    ],
    [
      'nonfinite',
      svg('<path stroke="black" d="M1 2 L1e999 4"/>'),
      undefined,
      '座標が範囲外',
    ],
    [
      'invalid-config',
      '<svg/>',
      '{"schemaVersion":2,"settings":{}}',
      'schemaVersion',
    ],
    [
      'outside',
      svg('<path stroke="black" d="M1 2 L999 4"/>'),
      undefined,
      'はみ出し',
    ],
  ])(
    '入力エラーをstderrへ出力する (%s)',
    async (name, svgInput, config, message) => {
      const { args, output } = await prepare(name, svgInput, config)
      await expect(cli(...args)).rejects.toMatchObject({
        code: 1,
        stdout: '',
        stderr: expect.stringContaining(message),
      })
      await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
    },
  )
})
