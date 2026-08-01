import { describe, expect, it } from 'vitest'
import type { Point } from '../types/geometry'
import { collectRingContours, generateConcentricRings } from './concentricFill'

const SQUARE_10: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

describe('generateConcentricRings(FR-17: 同心オフセット)', () => {
  it('正方形は線間隔ずつ内側へ縮んだリング群になる', () => {
    const rings = generateConcentricRings([SQUARE_10], 1)
    // 10x10を1mmずつ内側へ掘ると、level 0..4 の5リングで面積が尽きる
    expect(rings.length).toBe(5)
    for (const ring of rings) {
      // 閉ループ(始点=終点)になっている
      expect(ring[0]).toEqual(ring.at(-1))
    }
    const width = (ring: Point[]): number => {
      const xs = ring.map((p) => p.x)
      return Math.max(...xs) - Math.min(...xs)
    }
    for (let i = 1; i < rings.length; i++) {
      expect(width(rings[i])).toBeLessThan(width(rings[i - 1]))
    }
    expect(width(rings[0])).toBeCloseTo(10, 1)
    expect(width(rings[1])).toBeCloseTo(8, 1)
  })

  it('ドーナツでは外形が縮み穴が広がるため、各段2つの輪郭が得られる', () => {
    const outer: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ]
    const hole: Point[] = [
      { x: 15, y: 15 },
      { x: 15, y: 25 },
      { x: 25, y: 25 },
      { x: 25, y: 15 },
    ]
    const rings = collectRingContours([outer, hole], 2)
    const level1 = rings.filter((r) => r.level === 1)
    expect(level1.length).toBe(2)

    const bboxWidth = (contour: Point[]): number => {
      const xs = contour.map((p) => p.x)
      return Math.max(...xs) - Math.min(...xs)
    }
    const widths = level1.map((r) => bboxWidth(r.contour)).sort((a, b) => a - b)
    // 外形40は36へ縮み、穴10は14へ広がる
    expect(widths[0]).toBeCloseTo(14, 0)
    expect(widths[1]).toBeCloseTo(36, 0)
  })

  it('内側で島に分裂しても打ち切らず、分裂後の輪郭も集める', () => {
    // 中央がくびれたH字状。内側へ掘ると左右2つの島に分かれる
    const hShape: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 14 },
      { x: 20, y: 14 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 20, y: 30 },
      { x: 20, y: 16 },
      { x: 10, y: 16 },
      { x: 10, y: 30 },
      { x: 0, y: 30 },
    ]
    const rings = collectRingContours([hShape], 2)
    const deepest = Math.max(...rings.map((r) => r.level))
    const atDeepLevel = rings.filter((r) => r.level === deepest)
    expect(deepest).toBeGreaterThan(0)
    expect(atDeepLevel.length).toBeGreaterThanOrEqual(2)
  })

  it('リング数の上限を超えて生成しない', () => {
    const rings = collectRingContours([SQUARE_10], 0.001, 7)
    const levels = new Set(rings.map((r) => r.level))
    expect(levels.size).toBeLessThanOrEqual(7)
  })

  it('線間隔が0以下・輪郭が空なら何も生成しない', () => {
    expect(generateConcentricRings([SQUARE_10], 0)).toEqual([])
    expect(generateConcentricRings([], 1)).toEqual([])
  })
})
