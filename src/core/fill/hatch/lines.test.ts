import { describe, expect, it } from 'vitest'
import type { Point } from '../../geometry/types'
import type { HatchParams } from './lines'
import {
  filterChainsByMinLength,
  filterHatchRowsByMinLength,
  flattenHatchRows,
  generateHatchLines,
} from './lines'
import { apply, rotateDeg } from '../../geometry/matrix'

const SQUARE_10: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

function params(overrides: Partial<HatchParams> = {}): HatchParams {
  return {
    angleDeg: 0,
    spacingMm: 1,
    waveform: 'straight',
    waveAmplitudeMm: 0,
    waveLengthMm: 2,
    waveSegmentsPerCycle: 8,
    ...overrides,
  }
}

function normalProjection(p: Point, angleDeg: number): number {
  return apply(rotateDeg(-angleDeg), p).y
}

describe('generateHatchLines(FR-17: 平行線ハッチング生成)', () => {
  it('角度0度・間隔1mmの正方形は10本の水平ハッチ線になる', () => {
    const rows = generateHatchLines([SQUARE_10], params())
    const result = flattenHatchRows(rows)
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
    const result = flattenHatchRows(
      generateHatchLines([SQUARE_10], params({ angleDeg: 90 })),
    )
    expect(result.length).toBe(10)
    for (const segment of result) {
      expect(segment[0].x).toBeCloseTo(segment.at(-1)!.x, 2)
      const ys = segment.map((p) => p.y).sort((a, b) => a - b)
      expect(ys[0]).toBeCloseTo(0, 2)
      expect(ys.at(-1)!).toBeCloseTo(10, 2)
    }
  })

  it('角度45度でも隣接するハッチ線同士の垂直方向の間隔がspacingMmと一致する', () => {
    const result = flattenHatchRows(
      generateHatchLines([SQUARE_10], params({ angleDeg: 45, spacingMm: 2 })),
    )
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
    const rows = generateHatchLines([outer, hole], params({ spacingMm: 5 }))
    // 行は y=2.5,7.5,...,37.5 の8行。穴(y:15-25)にかかる2行(17.5, 22.5)だけ2区間に分裂する
    expect(rows.length).toBe(8)
    expect(flattenHatchRows(rows).length).toBe(10)
    const rowAt = (y: number) =>
      rows.find((r) => Math.abs(r.segments[0].points[0].y - y) < 0.01)!
    expect(rowAt(12.5).segments.length).toBe(1)
    expect(rowAt(17.5).segments.length).toBe(2)
    expect(rowAt(22.5).segments.length).toBe(2)
    expect(rowAt(27.5).segments.length).toBe(1)
  })

  it('行番号は行の並びと一致し、断片は行内でx昇順に並ぶ', () => {
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
    const rows = generateHatchLines([outer, hole], params({ spacingMm: 5 }))
    expect(rows.map((r) => r.rowIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    for (const row of rows) {
      for (let i = 1; i < row.segments.length; i++) {
        expect(row.segments[i].xStart).toBeGreaterThan(
          row.segments[i - 1].xStart,
        )
      }
      for (const s of row.segments) {
        expect(s.xEnd).toBeGreaterThanOrEqual(s.xStart)
      }
    }
  })
})

describe('generateHatchLines(波形モード)', () => {
  it('三角波は波長ごとに頂点を持ち、振幅の分だけ行の中心から上下する', () => {
    const rows = generateHatchLines(
      [SQUARE_10],
      params({
        spacingMm: 2,
        waveform: 'triangle',
        waveAmplitudeMm: 0.5,
        waveLengthMm: 2,
      }),
    )
    const segments = flattenHatchRows(rows)
    expect(segments.length).toBe(5)
    for (const [i, segment] of segments.entries()) {
      // 直線(2点)ではなく折れ線になっている
      expect(segment.length).toBeGreaterThan(2)
      const centerY = 1 + i * 2
      const ys = segment.map((p) => p.y)
      expect(Math.max(...ys)).toBeCloseTo(centerY + 0.5, 1)
      expect(Math.min(...ys)).toBeCloseTo(centerY - 0.5, 1)
    }
  })

  it('正弦波は1周期あたりの分割数だけ点を持つ', () => {
    const coarse = flattenHatchRows(
      generateHatchLines(
        [SQUARE_10],
        params({
          spacingMm: 2,
          waveform: 'sine',
          waveAmplitudeMm: 0.5,
          waveLengthMm: 5,
          waveSegmentsPerCycle: 4,
        }),
      ),
    )
    const fine = flattenHatchRows(
      generateHatchLines(
        [SQUARE_10],
        params({
          spacingMm: 2,
          waveform: 'sine',
          waveAmplitudeMm: 0.5,
          waveLengthMm: 5,
          waveSegmentsPerCycle: 20,
        }),
      ),
    )
    expect(fine[0].length).toBeGreaterThan(coarse[0].length)
  })

  it('振幅は線間隔の半分でクランプされる(隣接行との干渉を防ぐ)', () => {
    const rows = generateHatchLines(
      [SQUARE_10],
      params({
        spacingMm: 2,
        waveform: 'triangle',
        waveAmplitudeMm: 100,
        waveLengthMm: 2,
      }),
    )
    const segments = flattenHatchRows(rows)
    for (const [i, segment] of segments.entries()) {
      const centerY = 1 + i * 2
      for (const p of segment) {
        expect(Math.abs(p.y - centerY)).toBeLessThanOrEqual(1.01)
      }
    }
  })

  it('波形を付けても行番号は行の中心から正しく復元される', () => {
    const rows = generateHatchLines(
      [SQUARE_10],
      params({
        spacingMm: 1,
        waveform: 'sine',
        waveAmplitudeMm: 0.5,
        waveLengthMm: 1.3,
        waveSegmentsPerCycle: 8,
      }),
    )
    expect(rows.map((r) => r.rowIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('filterHatchRowsByMinLength', () => {
  it('0以下は無効(何も除外しない)', () => {
    const rows = generateHatchLines([SQUARE_10], params())
    expect(filterHatchRowsByMinLength(rows, 0)).toEqual(rows)
    expect(filterHatchRowsByMinLength(rows, -1)).toEqual(rows)
  })

  it('始点-終点の直線距離が閾値未満の断片を除外し、断片が0本になった行ごと落とす', () => {
    const rows = generateHatchLines([SQUARE_10], params())
    // 全断片が長さ10(0〜10行とも水平に横断)なので、11で全て除外される
    expect(filterHatchRowsByMinLength(rows, 11)).toEqual([])
    // 9なら全て残る
    expect(flattenHatchRows(filterHatchRowsByMinLength(rows, 9)).length).toBe(
      10,
    )
  })
})

describe('filterChainsByMinLength', () => {
  const chains = [
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  ]

  it('0以下は無効(何も除外しない)', () => {
    expect(filterChainsByMinLength(chains, 0)).toEqual(chains)
  })

  it('始点-終点の直線距離が閾値未満のチェーンを除外する', () => {
    expect(filterChainsByMinLength(chains, 5)).toEqual([chains[0]])
    expect(filterChainsByMinLength(chains, 100)).toEqual([])
  })
})
