import type { Point } from './types'

/** 2点間のユークリッド距離 */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
