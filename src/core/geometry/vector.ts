import type { Point } from './types'

/** 2点間のユークリッド距離 */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 点pから線分abまでの距離の2乗(端点でクランプ) */
export function distanceSqToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const cx = a.x + t * dx - p.x
  const cy = a.y + t * dy - p.y
  return cx * cx + cy * cy
}

/** 点pから線分abまでの距離(端点でクランプ) */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  return Math.sqrt(distanceSqToSegment(p, a, b))
}
