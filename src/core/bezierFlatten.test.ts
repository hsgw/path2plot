import { describe, expect, it } from 'vitest'
import type { Point } from '../types/geometry'
import { flattenCubicBezier, flattenQuadraticBezier } from './bezierFlatten'

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq),
  )
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function maxDeviation(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  polyline: Point[],
): number {
  const full = [p0, ...polyline]
  let maxDist = 0
  for (let i = 0; i <= 200; i++) {
    const t = i / 200
    const curvePoint = cubicAt(p0, p1, p2, p3, t)
    let minDist = Infinity
    for (let j = 0; j < full.length - 1; j++) {
      minDist = Math.min(
        minDist,
        distanceToSegment(curvePoint, full[j], full[j + 1]),
      )
    }
    maxDist = Math.max(maxDist, minDist)
  }
  return maxDist
}

describe('flattenCubicBezier', () => {
  const p0: Point = { x: 10, y: 50 }
  const p1: Point = { x: 10, y: 10 }
  const p2: Point = { x: 90, y: 10 }
  const p3: Point = { x: 90, y: 50 }

  it('制御点が一直線のときは分割せず終点のみ返す', () => {
    const line = flattenCubicBezier(
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      0.1,
    )
    expect(line).toEqual([{ x: 3, y: 3 }])
  })

  it('許容誤差を小さくするほど分割数(点数)が増える', () => {
    const coarse = flattenCubicBezier(p0, p1, p2, p3, 5)
    const fine = flattenCubicBezier(p0, p1, p2, p3, 0.1)
    const finer = flattenCubicBezier(p0, p1, p2, p3, 0.01)
    expect(fine.length).toBeGreaterThan(coarse.length)
    expect(finer.length).toBeGreaterThan(fine.length)
  })

  it('折線が実際の曲線から許容誤差の範囲内に収まる', () => {
    for (const tolerance of [1, 0.2, 0.05]) {
      const polyline = flattenCubicBezier(p0, p1, p2, p3, tolerance)
      const deviation = maxDeviation(p0, p1, p2, p3, polyline)
      expect(deviation).toBeLessThanOrEqual(tolerance * 1.5)
    }
  })
})

describe('flattenQuadraticBezier', () => {
  it('2次ベジェも許容誤差以内に折線化される', () => {
    const p0: Point = { x: 10, y: 80 }
    const p1: Point = { x: 50, y: 10 }
    const p2: Point = { x: 90, y: 80 }
    const tolerance = 0.1
    const polyline = flattenQuadraticBezier(p0, p1, p2, tolerance)
    expect(polyline.length).toBeGreaterThan(1)
    expect(polyline[polyline.length - 1]).toEqual(p2)
  })
})
