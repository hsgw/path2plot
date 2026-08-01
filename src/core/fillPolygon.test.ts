import { describe, expect, it } from 'vitest'
import type { Point } from '../types/geometry'
import type { FillCandidate } from '../types/fill'
import {
  clipOpenLinesToPolygon,
  insetPolygonRaw,
  offsetPolygon,
  resolveFillPolygon,
} from './fillPolygon'

function polygonArea(points: Point[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    sum += p1.x * p2.y - p2.x * p1.y
  }
  return sum / 2
}

function totalArea(paths: Point[][]): number {
  return paths.reduce((acc, p) => acc + polygonArea(p), 0)
}

function positiveCount(paths: Point[][]): number {
  return paths.filter((p) => polygonArea(p) > 0).length
}

function candidate(
  contours: Point[][],
  fillRule: FillCandidate['fillRule'],
): FillCandidate {
  return { id: 'c', fillColor: '#000', fillRule, contours }
}

const OUTER_40_CCW: Point[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
]

// (10,10)-(20,20)の穴。CCW(evenodd用、巻き方向は問わない)
const HOLE_10_20_CCW: Point[] = [
  { x: 10, y: 10 },
  { x: 20, y: 10 },
  { x: 20, y: 20 },
  { x: 10, y: 20 },
]

// 同じ穴をCW(外形と逆巻き)にしたもの。nonzeroで穴として認識させるために必要
const HOLE_10_20_CW: Point[] = [
  { x: 10, y: 10 },
  { x: 10, y: 20 },
  { x: 20, y: 20 },
  { x: 20, y: 10 },
]

const HOLE_25_35_CCW: Point[] = [
  { x: 25, y: 25 },
  { x: 35, y: 25 },
  { x: 35, y: 35 },
  { x: 25, y: 35 },
]

describe('resolveFillPolygon(FR-16: 閉パス自動検出・evenodd/nonzero)', () => {
  it('穴のない単純な閉図形はそのまま1つの輪郭になる', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const result = resolveFillPolygon(candidate([square], 'nonzero'))
    expect(result.length).toBe(1)
    expect(totalArea(result)).toBeCloseTo(100, 1)
  })

  it('evenoddのドーナツ形状は穴の巻き方向を問わず穴を認識する', () => {
    const result = resolveFillPolygon(
      candidate([OUTER_40_CCW, HOLE_10_20_CCW], 'evenodd'),
    )
    expect(result.length).toBe(2)
    expect(totalArea(result)).toBeCloseTo(1600 - 100, 1)
  })

  it('nonzeroのドーナツ形状は穴が外形と逆巻きの場合のみ穴として認識する', () => {
    const result = resolveFillPolygon(
      candidate([OUTER_40_CCW, HOLE_10_20_CW], 'nonzero'),
    )
    expect(result.length).toBe(2)
    expect(totalArea(result)).toBeCloseTo(1600 - 100, 1)
  })

  it('複数の穴があるevenodd形状は全ての穴を認識する', () => {
    const result = resolveFillPolygon(
      candidate([OUTER_40_CCW, HOLE_10_20_CCW, HOLE_25_35_CCW], 'evenodd'),
    )
    expect(result.length).toBe(3)
    expect(totalArea(result)).toBeCloseTo(1600 - 100 - 100, 1)
  })
})

describe('offsetPolygon(FR-20: 輪郭オフセット・round join・形状破綻判定)', () => {
  it('単純な正方形を内側にオフセットすると面積が縮小する', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const result = offsetPolygon([square], 1)
    expect('paths' in result).toBe(true)
    if ('paths' in result) {
      expect(result.paths.length).toBe(1)
      expect(totalArea(result.paths)).toBeCloseTo(64, 0.5)
    }
  })

  it('round joinのため、外側オフセットした角は鋭角(mitered corner)にならない', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    // offsetMm=-2 => Clipper側delta=+2(外側へ2mm拡大)
    const result = offsetPolygon([square], -2)
    expect('paths' in result).toBe(true)
    if (!('paths' in result)) return
    const cornerPoints = result.paths[0].filter(
      (p) => p.x > 10 + 1e-6 && p.y > 10 + 1e-6,
    )
    expect(cornerPoints.length).toBeGreaterThan(0)
    for (const p of cornerPoints) {
      const distance = Math.hypot(p.x - 10, p.y - 10)
      // mitered joinなら距離は2*sqrt(2)(約2.828)になるはず。round joinなら半径2の弧上に収まる
      expect(distance).toBeLessThanOrEqual(2.05)
    }
  })

  it('負のオフセット(外側へ拡大)で穴が縮んで消える場合はエラーにしない', () => {
    // FR-20: 正のoffsetMmは輪郭オフセットが内側へ縮小する方向。外形は縮み、穴は逆に広がる
    // (材料側から見てどちらの境界も内側へ後退するため)。負のoffsetMmはその逆で、
    // 外形が外側へ広がり、穴は縮む。穴の半径(2mm)より大きく外側へ広げれば穴は閉じきる
    const outer: Point[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ]
    const hole: Point[] = [
      { x: 8, y: 8 },
      { x: 8, y: 12 },
      { x: 12, y: 12 },
      { x: 12, y: 8 },
    ]
    const result = offsetPolygon([outer, hole], -3)
    expect('paths' in result).toBe(true)
    if ('paths' in result) {
      expect(result.paths.length).toBe(1)
      expect(totalArea(result.paths)).toBeGreaterThan(400)
    }
  })

  it('細い形状はオフセットで面積が崩壊しcollapsedと判定される', () => {
    const thin: Point[] = [
      { x: 5, y: 4.5 },
      { x: 55, y: 4.5 },
      { x: 55, y: 5.5 },
      { x: 5, y: 5.5 },
    ]
    const result = offsetPolygon([thin], 0.6)
    expect(result).toEqual({ error: 'collapsed' })
  })

  it('鉄アレイ形状は括れがオフセットで分裂しsplitと判定される', () => {
    const dumbbell: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4.5 },
      { x: 30, y: 4.5 },
      { x: 30, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 5.5 },
      { x: 10, y: 5.5 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(positiveCount([dumbbell])).toBe(1)
    const result = offsetPolygon([dumbbell], 0.6)
    expect(result).toEqual({ error: 'split' })
  })
})

describe('clipOpenLinesToPolygon(FR-17/19: ハッチ候補線のクリッピング)', () => {
  const square: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('図形を貫通する線は図形内部の区間だけが残る', () => {
    const line: Point[] = [
      { x: -5, y: 5 },
      { x: 15, y: 5 },
    ]
    const result = clipOpenLinesToPolygon([line], [square])
    expect(result.length).toBe(1)
    expect(result[0].map((p) => Math.round(p.x))).toEqual([0, 10])
  })

  it('図形の外側を通る線は完全に除去される', () => {
    const line: Point[] = [
      { x: -5, y: 20 },
      { x: 15, y: 20 },
    ]
    const result = clipOpenLinesToPolygon([line], [square])
    expect(result.length).toBe(0)
  })

  it('穴をまたぐ線は穴の部分が除去され複数区間に分裂する', () => {
    const outer: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ]
    const line: Point[] = [
      { x: -5, y: 20 },
      { x: 45, y: 20 },
    ]
    // clipOpenLinesToPolygonはNonZeroで解釈するため、穴は外形と逆巻き(CW)である必要がある
    // (resolveFillPolygon/offsetPolygonの出力が常にこの向きで正規化されることに対応)
    const result = clipOpenLinesToPolygon([line], [outer, HOLE_10_20_CW])
    expect(result.length).toBe(2)
  })
})

describe('insetPolygonRaw(同心オフセット・スパイラルのリング生成)', () => {
  const SQUARE_10: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('正の値で内側へ縮小する', () => {
    const result = insetPolygonRaw([SQUARE_10], 2)
    expect(result.length).toBe(1)
    const xs = result[0].map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(2, 1)
    expect(Math.max(...xs)).toBeCloseTo(8, 1)
  })

  it('掘り進めて消滅してもエラーにせず空配列を返す(offsetPolygonと異なる)', () => {
    expect(insetPolygonRaw([SQUARE_10], 20)).toEqual([])
    expect(offsetPolygon([SQUARE_10], 20)).toEqual({ error: 'collapsed' })
  })

  it('内側で複数の島に分裂してもエラーにせずそのまま返す(offsetPolygonと異なる)', () => {
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
    expect(positiveCount(insetPolygonRaw([hShape], 3))).toBe(2)
    expect(offsetPolygon([hShape], 3)).toEqual({ error: 'split' })
  })

  it('輪郭が空なら空配列を返す', () => {
    expect(insetPolygonRaw([], 1)).toEqual([])
  })
})
