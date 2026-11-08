import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { version } from '../../package.json'
import { convertSvg } from '../core/convert'
import { parseSettingsFile } from '../core/settingsFile'

const help = `使い方: node path2plot-cli.mjs --input INPUT.svg --output OUTPUT.gcode --config SETTINGS.json [--timing]

  --input    入力SVGファイル
  --output   出力G-codeファイル (既存ファイルは上書きしません)
  --config   Web UIと共通のJSON設定ファイル
  --timing   処理時間を標準エラー出力に表示
  --help     このヘルプを表示
  --version  バージョンを表示`

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
      config: { type: 'string' },
      timing: { type: 'boolean' },
      help: { type: 'boolean' },
      version: { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log(help)
    return
  }
  if (values.version) {
    console.log(version)
    return
  }
  const { input, output, config, timing } = values
  if (!input || !output || !config) {
    throw new Error(
      '--input、--output、--config を指定してください。使い方は --help で確認できます',
    )
  }

  const totalStart = performance.now()
  const settings = parseSettingsFile(await readFile(config, 'utf8'))
  const logTiming = (stage: string, milliseconds: number) =>
    console.error(`[timing] ${stage} ${milliseconds.toFixed(1)} ms`)
  const readStart = performance.now()
  const svg = await readFile(input, 'utf8')
  if (timing) logTiming('SVG読み込み', performance.now() - readStart)

  const gcode = convertSvg(svg, settings, timing ? logTiming : undefined)
  try {
    await writeFile(output, gcode, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`出力ファイルが既に存在します: ${output}`)
    }
    throw error
  }
  if (timing) logTiming('合計', performance.now() - totalStart)
}

try {
  await main()
} catch (error) {
  console.error(
    `path2plot: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
}
