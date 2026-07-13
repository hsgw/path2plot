import { describe, expect, it } from 'vitest'
import type { Point } from '../types/geometry'
import { generateHatchLines } from './hatchGenerate'
import { apply, rotateDeg } from './matrix'

const SQUARE_10: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

function normalProjection(p: Point, angleDeg: number): number {
  return apply(rotateDeg(-angleDeg), p).y
}

describe('generateHatchLines(FR-17: 平行線ハッチング生成)', () => {
  it('角度0度・間隔1mmの正方形は10本の水平ハッチ線になる', () => {
    const result = generateHatchLines([SQUARE_10], 0, 1)
    expect(result.length).toBe(10)
    for (const [i, segment] of result.entries()) {
      const expectedY = 0.5 + i
      expect(segment[0].y).toBeCloseTo(expectedY, 2)
      expect(segment.at(-1)!.y).toBeCloseTo(expectedY, 2)
      const xs = segment.map((p) => p.x).sort((a, b) => a - b)
      expect(xs[0]).toBeCloseTo(0, 2)
      expect(xs.at(-1)!).toBeCloseTo(10, 2)
    }
  })

  it('角度90度・間隔1mmの正方形は10本の垂直ハッチ線になる', () => {
    const result = generateHatchLines([SQUARE_10], 90, 1)
    expect(result.length).toBe(10)
    for (const segment of result) {
      expect(segment[0].x).toBeCloseTo(segment.at(-1)!.x, 2)
      const ys = segment.map((p) => p.y).sort((a, b) => a - b)
      expect(ys[0]).toBeCloseTo(0, 2)
      expect(ys.at(-1)!).toBeCloseTo(10, 2)
    }
  })

  it('角度45度でも隣接するハッチ線同士の垂直方向の間隔がspacingMmと一致する', () => {
    const result = generateHatchLines([SQUARE_10], 45, 2)
    expect(result.length).toBeGreaterThan(1)
    const projections = result
      .map((segment) => normalProjection(segment[0], 45))
      .sort((a, b) => a - b)
    for (let i = 1; i < projections.length; i++) {
      expect(projections[i] - projections[i - 1]).toBeCloseTo(2, 2)
    }
    for (const segment of result) {
      for (const p of segment) {
        expect(p.x).toBeGreaterThanOrEqual(-0.01)
        expect(p.x).toBeLessThanOrEqual(10.01)
        expect(p.y).toBeGreaterThanOrEqual(-0.01)
        expect(p.y).toBeLessThanOrEqual(10.01)
      }
    }
  })

  it('穴をまたぐ行は穴の部分が除かれ2本の区間に分裂する', () => {
    const outer: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ]
    // 外形と逆巻き(CW)の穴。clipOpenLinesToPolygon(NonZero)で正しく穴として扱われる
    const hole: Point[] = [
      { x: 15, y: 15 },
      { x: 15, y: 25 },
      { x: 25, y: 25 },
      { x: 25, y: 15 },
    ]
    const result = generateHatchLines([outer, hole], 0, 5)
    // 行は y=2.5,7.5,...,37.5 の8本。穴(y:15-25)にかかる2行(17.5, 22.5)だけ2区間に分裂する
    expect(result.length).toBe(10)
    const rowsAt = (y: number) =>
      result.filter((s) => Math.abs(s[0].y - y) < 0.01)
    expect(rowsAt(12.5).length).toBe(1)
    expect(rowsAt(17.5).length).toBe(2)
    expect(rowsAt(22.5).length).toBe(2)
    expect(rowsAt(27.5).length).toBe(1)
  })
})
