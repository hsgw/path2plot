import type { Point } from '../geometry/types'
import type {
  FillBlock,
  FillCandidate,
  FillGeometryError,
  FillSettings,
} from './types'
import { offsetPolygon, resolveFillPolygon } from './clipper'
import { resolveEffectiveFillSettings } from './overrides'
import {
  filterChainsByMinLength,
  filterHatchRowsByMinLength,
  flattenHatchRows,
  generateHatchLines,
} from './hatch/lines'
import {
  connectHatchRowsBoustrophedon,
  connectHatchRowsZigzag,
  orderHatchLinesAsChains,
} from './hatch/connect'
import { generateConcentricRings } from './concentric'
import { generateSpiralPath } from './spiral'
import { closeLoop } from '../geometry/polygon'

function describeError(_kind: FillGeometryError['kind']): string {
  return '塗りオフセットにより形状が崩壊しました(面積が0以下になりました)'
}

/** 1方向分のハッチを生成し、連結モードに応じたチェーン列にする */
function buildHatchChains(
  region: Point[][],
  angleDeg: number,
  settings: FillSettings,
): Point[][] {
  const rows = generateHatchLines(region, {
    angleDeg,
    spacingMm: settings.spacingMm,
    waveform: settings.waveform,
    waveAmplitudeMm: settings.waveAmplitudeMm,
    waveLengthMm: settings.waveLengthMm,
    waveSegmentsPerCycle: settings.waveSegmentsPerCycle,
  })

  switch (settings.connect) {
    case 'zigzag':
      // zigzagは行の端点だけを使って接続するため、個々のハッチ線ではなく
      // 全ハッチ線で接続した後の結果に対して最小長フィルタをかける
      return filterChainsByMinLength(
        connectHatchRowsZigzag(rows, region),
        settings.minHatchLineLengthMm,
      )
    case 'boustrophedon': {
      // 往復は接続前に短いハッチ線を除外してから接続する
      const filteredRows = filterHatchRowsByMinLength(
        rows,
        settings.minHatchLineLengthMm,
      )
      return connectHatchRowsBoustrophedon(
        filteredRows,
        region,
        settings.spacingMm * settings.connectDistanceFactor,
      )
    }
    default: {
      // 連結しない場合も、短いハッチ線を除外してから訪問順序・向きだけを最適化する
      const filteredRows = filterHatchRowsByMinLength(
        rows,
        settings.minHatchLineLengthMm,
      )
      return orderHatchLinesAsChains(flattenHatchRows(filteredRows))
    }
  }
}

function buildChains(region: Point[][], settings: FillSettings): Point[][] {
  switch (settings.pattern) {
    case 'concentric':
      return generateConcentricRings(region, settings.spacingMm)
    case 'spiral':
      return generateSpiralPath(region, settings.spacingMm)
    default: {
      // クロスハッチは方向ごとに独立して連結する(方向をまたいだ連結はしない)
      const angles = settings.crossHatch
        ? [settings.angleDeg, settings.crossAngleDeg]
        : [settings.angleDeg]
      return angles.flatMap((angleDeg) =>
        buildHatchChains(region, angleDeg, settings),
      )
    }
  }
}

/**
 * FR-16〜FR-21: fill候補1つを、輪郭解決→オフセット→塗り線生成→輪郭線という一連の処理にかけ、
 * 1つの塗りブロック(FR-22)にまとめる。
 *
 * 同心オフセット・スパイラルは最も外側のリングが輪郭そのものなので、FR-21の輪郭線は
 * 二重描画になるため生成しない(UI側でも輪郭線の設定を出さない)。
 */
function buildFillBlock(
  candidate: FillCandidate,
  settings: FillSettings,
): FillBlock {
  const resolved = resolveFillPolygon(candidate)
  const offsetResult = offsetPolygon(resolved, settings.fillOffsetMm)
  const outlineIsRedundant =
    settings.pattern === 'concentric' || settings.pattern === 'spiral'
  const outlineLoops =
    settings.drawOutline && !outlineIsRedundant ? resolved.map(closeLoop) : null

  if ('error' in offsetResult) {
    return {
      id: candidate.id,
      sourceId: candidate.sourceId,
      color: candidate.fillColor,
      outlineLoops,
      fillChains: [],
      error: {
        fillBlockId: candidate.id,
        sourceId: candidate.sourceId,
        kind: offsetResult.error,
        message: describeError(offsetResult.error),
      },
    }
  }

  const region = offsetResult.paths
  const fillChains = buildChains(region, settings)

  return {
    id: candidate.id,
    sourceId: candidate.sourceId,
    color: candidate.fillColor,
    outlineLoops,
    fillChains,
  }
}

/**
 * fillごとの個別上書きを解決してから塗りブロックを生成する。グローバルのenabled=falseでも
 * 個別上書きでenabled=trueにしたcandidateはそのfillだけ生成する
 */
export function buildFillBlocks(
  candidates: FillCandidate[],
  settings: FillSettings,
  overrides: Map<string, Partial<FillSettings>>,
): FillBlock[] {
  return candidates.flatMap((candidate) => {
    const effective = resolveEffectiveFillSettings(
      settings,
      overrides.get(candidate.id),
    )
    if (!effective.enabled) return []
    return [buildFillBlock(candidate, effective)]
  })
}
