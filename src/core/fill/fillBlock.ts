import type { Point } from '../geometry/types'
import type {
  FillBlock,
  FillCandidate,
  FillGeometryError,
  FillSettings,
} from './types'
import { offsetPolygon, resolveFillPolygon } from './clipper'
import { flattenHatchRows, generateHatchLines } from './hatch/lines'
import {
  connectHatchRowsBoustrophedon,
  connectHatchRowsZigzag,
  orderHatchLinesAsChains,
} from './hatch/connect'
import { generateConcentricRings } from './concentric'
import { generateSpiralPath } from './spiral'
import { closeLoop } from '../geometry/polygon'

function describeError(kind: FillGeometryError['kind']): string {
  return kind === 'collapsed'
    ? '輪郭オフセットにより形状が崩壊しました(面積が0以下になりました)'
    : '輪郭オフセットにより形状が意図しない複数ポリゴンに分裂しました'
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
      return connectHatchRowsZigzag(rows, region)
    case 'boustrophedon':
      return connectHatchRowsBoustrophedon(
        rows,
        region,
        settings.spacingMm * settings.connectDistanceFactor,
      )
    default:
      // 連結しない場合も、訪問順序・向きだけは最適化してペンアップ移動距離を減らす
      return orderHatchLinesAsChains(flattenHatchRows(rows))
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
  const offsetResult = offsetPolygon(resolved, settings.contourOffsetMm)

  if ('error' in offsetResult) {
    return {
      id: candidate.id,
      sourceId: candidate.sourceId,
      color: candidate.fillColor,
      outlineLoops: null,
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
  const outlineIsRedundant =
    settings.pattern === 'concentric' || settings.pattern === 'spiral'
  const outlineLoops =
    settings.drawOutline && !outlineIsRedundant ? region.map(closeLoop) : null

  return {
    id: candidate.id,
    sourceId: candidate.sourceId,
    color: candidate.fillColor,
    outlineLoops,
    fillChains,
  }
}

export function buildFillBlocks(
  candidates: FillCandidate[],
  settings: FillSettings,
): FillBlock[] {
  if (!settings.enabled) return []
  return candidates.map((candidate) => buildFillBlock(candidate, settings))
}
