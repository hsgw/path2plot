import { buildFillBlocks } from './fill/fillBlock'
import {
  checkFillCandidateBounds,
  checkStrokeBounds,
} from './gcode/boundsCheck'
import { generateGcode } from './gcode/generate'
import { buildDrawGroups } from './plan/drawPlan'
import { toDrawUnits } from './plan/drawUnit'
import { configuredDrawOrder } from './plan/optimizeOrder'
import { buildJoinedBlocks, unjoinedBlocks } from './plan/strokeJoin'
import { filterJoinedBlocksByMinimumLength } from './plan/strokeLength'
import type { SettingsBundle } from './settingsFile'
import { parseSvgFile } from './svg/parseSvgFile'

type ConversionStage = 'SVG解析' | 'パス処理' | 'G-code生成'

/** プレビューを作らず、Webと同じ段階を1回の変換として実行する。 */
export function convertSvg(
  svg: string,
  settings: SettingsBundle,
  onTiming?: (stage: ConversionStage, milliseconds: number) => void,
): string {
  function measure<T>(stage: ConversionStage, run: () => T): T {
    if (!onTiming) return run()
    const start = performance.now()
    try {
      return run()
    } finally {
      onTiming(stage, performance.now() - start)
    }
  }

  const { gcodeSettings, pathOptions } = settings
  const { strokes, fillCandidates, errors } = measure('SVG解析', () =>
    parseSvgFile(svg, settings.parseSettings),
  )
  const fatalError = errors.find((error) => error.kind === 'parse-error')
  if (fatalError) throw new Error(`SVG解析エラー: ${fatalError.message}`)

  const bed = {
    widthMm: gcodeSettings.bedWidthMm,
    heightMm: gcodeSettings.bedHeightMm,
  }
  const warningCount =
    checkStrokeBounds(strokes, bed).length +
    checkFillCandidateBounds(fillCandidates, bed).length
  if (warningCount > 0) {
    throw new Error(`描画可能領域をはみ出しています (${warningCount}件)`)
  }

  const groups = measure('パス処理', () => {
    const blocks =
      pathOptions.optimizePaths && pathOptions.joinPaths
        ? buildJoinedBlocks(
            strokes,
            settings.joinDistanceMm,
            new Map(),
            pathOptions.reversePaths,
          )
        : unjoinedBlocks(strokes)
    const fillBlocks = buildFillBlocks(
      fillCandidates,
      settings.fillSettings,
      new Map(),
    )
    const visibleBlocks = filterJoinedBlocksByMinimumLength(
      blocks,
      strokes,
      settings.minStrokeLengthMm,
    )
    const units = toDrawUnits(visibleBlocks, fillBlocks)
    return buildDrawGroups(
      units,
      strokes,
      configuredDrawOrder(units, strokes, pathOptions),
    )
  })
  if (groups.length === 0) {
    throw new Error(errors[0]?.message ?? '描画できるパスがありません')
  }
  return measure('G-code生成', () => generateGcode(groups, gcodeSettings))
}
