import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { version } from '../../package.json'
import { basename } from 'node:path'
import { uploadGcodeToMoonraker } from '../app/downloadFile'
import { convertSvg } from '../core/convert'
import { parseSettingsFile } from '../core/settingsFile'

const isPiBuild = import.meta.env.MODE === 'pi'
const help = `使い方: node path2plot-cli.mjs --input INPUT.svg --output OUTPUT.gcode --config SETTINGS.json [--timing]${isPiBuild ? ' [--print [--overwrite]]' : ''}

  --input    入力SVGファイル
  --output   出力G-codeファイル (既存ファイルは上書きしません)
  --config   Web UIと共通のJSON設定ファイル
  --timing   処理時間を標準エラー出力に表示
${isPiBuild ? '  --print    G-codeをMoonrakerに保存して印刷を要求\n  --overwrite --print時に同名のMoonrakerファイルを上書き' : ''}
  --help     このヘルプを表示
  --version  バージョンを表示`

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
      config: { type: 'string' },
      timing: { type: 'boolean' },
      print: { type: 'boolean' },
      overwrite: { type: 'boolean' },
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
  if (values.print && !isPiBuild)
    throw new Error('--print はPi CLIビルドでのみ使用できます')
  if (values.overwrite && !values.print)
    throw new Error('--overwrite は --print と併用してください')
  const { input, output, config, timing, print, overwrite } = values
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
  if (print) {
    const remoteName = basename(output)
    if (!remoteName || remoteName === '.' || remoteName === '..')
      throw new Error('リモートのファイル名を決定できません')
    const result = await uploadGcodeToMoonraker(gcode, remoteName, {
      baseUrl: 'http://127.0.0.1:7125',
      print: true,
      overwrite,
      confirmOverwrite: () => false,
    })
    if (!result.saved)
      throw new Error(
        `Moonrakerに同名ファイルがあります: ${remoteName} (--overwrite で明示的に上書きできます。ローカル出力は保存済みです)`,
      )
    if (result.printStatus === 'started')
      console.error(`Moonrakerで印刷を開始しました: ${remoteName}`)
    else if (result.printStatus === 'queued')
      console.error(`Moonrakerの印刷キューに追加しました: ${remoteName}`)
    else
      throw new Error(
        `G-codeはローカルとMoonrakerに保存されましたが、印刷開始状態を確認できません (${result.printStatus})`,
      )
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
