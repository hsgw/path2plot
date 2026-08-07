import { distance } from '../geometry/vector'
import type { Point } from '../geometry/types'

/**
 * 微小セグメントによる減速を防ぐため、連続する点の間隔がminLengthMm未満になる中間点を間引く(FR-34)。
 * 始点・終点は形状維持のため常に保持する。
 */
export function filterMinSegmentLength(
  points: Point[],
  minLengthMm: number,
): Point[] {
  if (points.length <= 2 || minLengthMm <= 0) return points

  const result: Point[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const last = result[result.length - 1]
    const p = points[i]
    if (distance(p, last) >= minLengthMm) {
      result.push(p)
    }
  }
  result.push(points[points.length - 1])
  return result
}
