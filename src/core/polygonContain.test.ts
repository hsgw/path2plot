import { describe, expect, it } from 'vitest'
import type { Point } from '../types/geometry'
import { isPointInsidePolygon, isSegmentInsidePolygon } from './polygonContain'

const square: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

/** 中央に穴のあるドーナツ(外形40角・穴は15〜25) */
const donut: Point[][] = [
  [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 0, y: 40 },
  ],
  [
    { x: 15, y: 15 },
    { x: 15, y: 25 },
    { x: 25, y: 25 },
    { x: 25, y: 15 },
  ],
]

describe('isPointInsidePolygon', () => {
  it('単純な矩形の内外を判定する', () => {
    expect(isPointInsidePolygon({ x: 5, y: 5 }, [square])).toBe(true)
    expect(isPointInsidePolygon({ x: 15, y: 5 }, [square])).toBe(false)
  })

  it('穴の内部は外側と判定する(even-odd)', () => {
    expect(isPointInsidePolygon({ x: 5, y: 20 }, donut)).toBe(true)
    expect(isPointInsidePolygon({ x: 20, y: 20 }, donut)).toBe(false)
  })
})

describe('isSegmentInsidePolygon', () => {
  it('凸形状では境界上の2点を結ぶ線分は常に内側', () => {
    expect(
      isSegmentInsidePolygon({ x: 0, y: 2 }, { x: 10, y: 8 }, [square]),
    ).toBe(true)
  })

  it('形状の外を通る線分は外側と判定する', () => {
    expect(
      isSegmentInsidePolygon({ x: 5, y: 5 }, { x: 20, y: 5 }, [square]),
    ).toBe(false)
  })

  it('穴を横切る線分(両端は穴の境界上)は外側と判定する', () => {
    expect(
      isSegmentInsidePolygon({ x: 15, y: 20 }, { x: 25, y: 20 }, donut),
    ).toBe(false)
  })

  it('穴を貫通する線分は外側、穴を避けて通る線分は内側と判定する', () => {
    expect(
      isSegmentInsidePolygon({ x: 5, y: 20 }, { x: 35, y: 20 }, donut),
    ).toBe(false)
    expect(isSegmentInsidePolygon({ x: 5, y: 5 }, { x: 35, y: 5 }, donut)).toBe(
      true,
    )
  })

  it('離れた2つの島の間をまたぐ線分は外側と判定する', () => {
    const islands: Point[][] = [
      square,
      [
        { x: 15, y: 0 },
        { x: 25, y: 0 },
        { x: 25, y: 10 },
        { x: 15, y: 10 },
      ],
    ]
    expect(
      isSegmentInsidePolygon({ x: 10, y: 5 }, { x: 15, y: 5 }, islands),
    ).toBe(false)
  })

  it('凹形状の凹み部分を横切る線分は外側と判定する', () => {
    const lShape: Point[][] = [
      [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 30 },
        { x: 0, y: 30 },
      ],
    ]
    expect(
      isSegmentInsidePolygon({ x: 30, y: 5 }, { x: 5, y: 30 }, lShape),
    ).toBe(false)
  })

  it('輪郭に沿った線分(境界上)は内側扱いにする', () => {
    expect(
      isSegmentInsidePolygon({ x: 0, y: 0 }, { x: 10, y: 0 }, [square]),
    ).toBe(true)
  })

  it('端点が丸め誤差でわずかに輪郭の外側にあっても内側と判定する', () => {
    expect(
      isSegmentInsidePolygon({ x: -1e-5, y: 2 }, { x: 10 + 1e-5, y: 8 }, [
        square,
      ]),
    ).toBe(true)
  })

  it('塗り領域が空なら常に外側と判定する', () => {
    expect(isSegmentInsidePolygon({ x: 0, y: 0 }, { x: 1, y: 1 }, [])).toBe(
      false,
    )
  })
})
