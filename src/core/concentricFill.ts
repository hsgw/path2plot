import type { Point } from '../types/geometry'
import { insetPolygonRaw } from './fillPolygon'
import { boundsOfPoints, closeLoop } from './polygonUtil'

/** リング数の絶対上限。線間隔に極端に小さい値を入れられた場合の暴走を防ぐ */
const MAX_RINGS = 2000

export interface RingContour {
  /** 0 = 元の輪郭そのもの。nなら内側へ n×spacingMm オフセットした位置 */
  level: number
  /** 始点≠終点の開いた輪郭。描画時に閉じる */
  contour: Point[]
}

/**
 * 塗り領域を線間隔ずつ内側へオフセットしていき、各段階の輪郭を集める。
 * オフセットは前段の結果を再オフセットする累積方式ではなく、毎回**元の輪郭から n×spacingMm**を
 * 一度にオフセットして求める(累積では丸め誤差が段数分たまるため)。
 * 内側へ掘り進めば形状が複数の島へ分裂したり消滅したりするのは正常な結果なので、
 * offsetPolygonの破綻判定は使わずinsetPolygonRawを使う。
 */
export function collectRingContours(
  offsetPaths: Point[][],
  spacingMm: number,
  maxRings = MAX_RINGS,
): RingContour[] {
  if (offsetPaths.length === 0 || spacingMm <= 0) return []

  const { minX, maxX, minY, maxY } = boundsOfPoints(offsetPaths.flat())
  // 対角長を超えて内側へ掘り進めることはないので、これを段数の理論上限とする
  const diagonal = Math.hypot(maxX - minX, maxY - minY)
  const limit = Math.min(maxRings, Math.ceil(diagonal / spacingMm) + 1)

  const rings: RingContour[] = []
  for (let level = 0; level < limit; level++) {
    const paths =
      level === 0
        ? offsetPaths
        : insetPolygonRaw(offsetPaths, level * spacingMm)
    if (paths.length === 0) break
    let added = 0
    for (const contour of paths) {
      if (contour.length >= 3) {
        rings.push({ level, contour })
        added++
      }
    }
    if (added === 0) break
  }
  return rings
}

/**
 * FR-17(同心オフセット): 塗り領域の輪郭を線間隔ずつ内側へオフセットしたリング群で塗る。
 * 各リングは閉ループ(始点=終点)として返す。level 0 は元の輪郭そのものなので、
 * このパターンでは輪郭線(FR-21)を別途描く必要はない。
 */
export function generateConcentricRings(
  offsetPaths: Point[][],
  spacingMm: number,
): Point[][] {
  return collectRingContours(offsetPaths, spacingMm).map((r) =>
    closeLoop(r.contour),
  )
}
