import type { Point } from '../geometry/types'
import type { PreviewSegment } from './types'

/** 点と線分の最短距離の二乗 */
function distanceSquaredToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < 1e-12) {
    const ex = p.x - a.x
    const ey = p.y - a.y
    return ex * ex + ey * ey
  }
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared),
  )
  const ex = p.x - (a.x + t * dx)
  const ey = p.y - (a.y + t * dy)
  return ex * ex + ey * ey
}

/**
 * 折線と点との最短距離の二乗。線分ごとのbboxで足切りしてから厳密計算する
 * (maxDistSquaredより明らかに遠い線分は距離計算そのものを省く)
 */
function distanceSquaredToPolyline(
  p: Point,
  points: Point[],
  maxDistSquared: number,
): number {
  const margin = Math.sqrt(maxDistSquared)
  let best = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (
      p.x < Math.min(a.x, b.x) - margin ||
      p.x > Math.max(a.x, b.x) + margin ||
      p.y < Math.min(a.y, b.y) - margin ||
      p.y > Math.max(a.y, b.y) + margin
    ) {
      continue
    }
    const d = distanceSquaredToSegment(p, a, b)
    if (d < best) best = d
  }
  return best
}

/**
 * FR-43(プレビュー→リスト方向): mm座標上の点に最も近い物理セグメントのインデックスを返す
 * (thresholdMm以内に何もなければnull)。まだ描画されていないゴースト表示分も対象に含める
 */
export function findSegmentAtPoint(
  segments: PreviewSegment[],
  point: Point,
  thresholdMm: number,
): number | null {
  const thresholdSquared = thresholdMm * thresholdMm
  let bestIndex = -1
  let bestDistSquared = thresholdSquared
  for (let i = 0; i < segments.length; i++) {
    const points = segments[i].points
    if (points.length < 2) continue
    const d = distanceSquaredToPolyline(point, points, bestDistSquared)
    if (d < bestDistSquared) {
      bestDistSquared = d
      bestIndex = i
    }
  }
  return bestIndex === -1 ? null : bestIndex
}
