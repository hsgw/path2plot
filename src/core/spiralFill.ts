import type { Point } from '../types/geometry'
import { collectRingContours } from './concentricFill'
import { isSegmentInsidePolygon } from './polygonContain'

/**
 * スパイラルのリング数上限。連結先の探索が「残りリング数 × 総点数」に比例するため、
 * 同心オフセット(MAX_RINGS)より厳しめに抑える。
 */
const MAX_SPIRAL_RINGS = 500

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 輪郭をstartIdxから始まるように回転させ、始点に戻って閉じた点列にする */
function rotateAndClose(contour: Point[], startIdx: number): Point[] {
  const rotated = [...contour.slice(startIdx), ...contour.slice(0, startIdx)]
  rotated.push(rotated[0])
  return rotated
}

/**
 * FR-17(スパイラル): 同心オフセットのリングを、外側から順に「現在の末尾に最も近い点」で
 * 切って開き、1本につないでいく簡易スパイラル。
 *
 * 半径を角度で連続補間する「真の渦巻き」は穴のある形状では成立しないため採らない。
 * リング間の接続線が塗り領域の外を通る場合(離れた島へ渡る場合など)は連結せずチェーンを分ける
 * ため、戻り値は複数本になりうる。
 */
export function generateSpiralPath(
  offsetPaths: Point[][],
  spacingMm: number,
): Point[][] {
  const rings = collectRingContours(offsetPaths, spacingMm, MAX_SPIRAL_RINGS)
  if (rings.length === 0) return []

  const remaining = rings.map((_, i) => i)
  const result: Point[][] = []
  let chain: Point[] | null = null

  while (remaining.length > 0) {
    // 最初の1本は最も外側(collectRingContoursの先頭)から始める
    let bestPos = 0
    let bestPointIdx = 0

    const tail = chain?.at(-1)
    if (tail) {
      let bestDistance = Infinity
      for (let k = 0; k < remaining.length; k++) {
        const contour = rings[remaining[k]].contour
        for (let i = 0; i < contour.length; i++) {
          const d = dist(tail, contour[i])
          if (d < bestDistance) {
            bestDistance = d
            bestPos = k
            bestPointIdx = i
          }
        }
      }
    }

    const piece = rotateAndClose(
      rings[remaining[bestPos]].contour,
      bestPointIdx,
    )
    remaining.splice(bestPos, 1)

    if (chain && tail && isSegmentInsidePolygon(tail, piece[0], offsetPaths)) {
      chain.push(...piece)
    } else {
      if (chain) result.push(chain)
      chain = piece
    }
  }
  if (chain) result.push(chain)

  return result
}
