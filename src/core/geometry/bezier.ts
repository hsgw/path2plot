import type { Point } from './types'

const MAX_DEPTH = 24

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y)
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  const clamped = Math.max(0, Math.min(1, t))
  const projX = a.x + clamped * dx
  const projY = a.y + clamped * dy
  return Math.hypot(p.x - projX, p.y - projY)
}

function isFlatEnough(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance: number,
): boolean {
  return (
    distanceToSegment(p1, p0, p3) <= tolerance &&
    distanceToSegment(p2, p0, p3) <= tolerance
  )
}

function subdivideCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
): [[Point, Point, Point, Point], [Point, Point, Point, Point]] {
  const mid = (a: Point, b: Point): Point => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  })
  const p01 = mid(p0, p1)
  const p12 = mid(p1, p2)
  const p23 = mid(p2, p3)
  const p012 = mid(p01, p12)
  const p123 = mid(p12, p23)
  const p0123 = mid(p012, p123)
  return [
    [p0, p01, p012, p0123],
    [p0123, p123, p23, p3],
  ]
}

function flattenRecursive(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance: number,
  depth: number,
  out: Point[],
): void {
  if (depth >= MAX_DEPTH || isFlatEnough(p0, p1, p2, p3, tolerance)) {
    out.push(p3)
    return
  }
  const [left, right] = subdivideCubic(p0, p1, p2, p3)
  flattenRecursive(
    left[0],
    left[1],
    left[2],
    left[3],
    tolerance,
    depth + 1,
    out,
  )
  flattenRecursive(
    right[0],
    right[1],
    right[2],
    right[3],
    tolerance,
    depth + 1,
    out,
  )
}

/**
 * 3次ベジェ曲線を許容誤差(tolerance、始点p0と同じ座標空間の単位)で折線化する。
 * 戻り値はp0を含まずp3で終わる点列(呼び出し側で現在の点列に連結する用途を想定)。
 */
export function flattenCubicBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance: number,
): Point[] {
  const out: Point[] = []
  flattenRecursive(p0, p1, p2, p3, Math.max(tolerance, 1e-9), 0, out)
  return out
}

/** 2次ベジェ(p0,p1,p2)を等価な3次ベジェへ昇次したときの制御点 */
export function quadraticToCubicControls(
  p0: Point,
  p1: Point,
  p2: Point,
): { c1: Point; c2: Point } {
  return {
    c1: {
      x: p0.x + (2 / 3) * (p1.x - p0.x),
      y: p0.y + (2 / 3) * (p1.y - p0.y),
    },
    c2: {
      x: p2.x + (2 / 3) * (p1.x - p2.x),
      y: p2.y + (2 / 3) * (p1.y - p2.y),
    },
  }
}

/** 2次ベジェ曲線を3次ベジェへ昇次してから折線化する */
export function flattenQuadraticBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  tolerance: number,
): Point[] {
  const { c1, c2 } = quadraticToCubicControls(p0, p1, p2)
  return flattenCubicBezier(p0, c1, c2, p2, tolerance)
}
