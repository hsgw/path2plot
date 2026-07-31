import type { Point } from '../types/geometry'
import type {
  FillBlock,
  FillCandidate,
  FillGeometryError,
  FillSettings,
} from '../types/fill'
import { offsetPolygon, resolveFillPolygon } from './fillPolygon'
import { generateHatchLines } from './hatchGenerate'
import {
  connectHatchLines,
  orderHatchLinesByNearestNeighbor,
} from './hatchZigzag'

function closeLoop(contour: Point[]): Point[] {
  return [...contour, contour[0]]
}

function describeError(kind: FillGeometryError['kind']): string {
  return kind === 'collapsed'
    ? '輪郭オフセットにより形状が崩壊しました(面積が0以下になりました)'
    : '輪郭オフセットにより形状が意図しない複数ポリゴンに分裂しました'
}

/**
 * FR-16〜FR-21: fill候補1つを、輪郭解決→オフセット→ハッチ生成→(zigzag設定に応じ)ジグザグ結合→
 * 輪郭線抽出という一連の処理にかけ、1つの塗りブロック(FR-22)にまとめる。
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
      hatchChains: [],
      error: {
        fillBlockId: candidate.id,
        sourceId: candidate.sourceId,
        kind: offsetResult.error,
        message: describeError(offsetResult.error),
      },
    }
  }

  const rawLines = generateHatchLines(
    offsetResult.paths,
    settings.angleDeg,
    settings.spacingMm,
  )
  // zigzag=falseでも、ハッチ線の訪問順序・向きは最適化した上で個別チェーン(個別ペンアップ移動)にする
  const hatchChains = settings.zigzag
    ? connectHatchLines(
        rawLines,
        settings.spacingMm * settings.zigzagToleranceFactor,
        offsetResult.paths,
      )
    : orderHatchLinesByNearestNeighbor(rawLines).map(({ line, reversed }) =>
        reversed ? [...line].reverse() : [...line],
      )
  const outlineLoops = settings.drawOutline
    ? offsetResult.paths.map(closeLoop)
    : null

  return {
    id: candidate.id,
    sourceId: candidate.sourceId,
    color: candidate.fillColor,
    outlineLoops,
    hatchChains,
  }
}

export function buildFillBlocks(
  candidates: FillCandidate[],
  settings: FillSettings,
): FillBlock[] {
  if (!settings.enabled) return []
  return candidates.map((candidate) => buildFillBlock(candidate, settings))
}
