import { describe, expect, it } from 'vitest'
import { greedyOptimizeOrder } from './travelOrder'

describe('greedyOptimizeOrder', () => {
  it('開始点から最近傍のユニットを逐次選択する', () => {
    const units = [
      { start: { x: 100, y: 100 }, end: { x: 101, y: 101 } },
      { start: { x: 1, y: 0 }, end: { x: 2, y: 0 } },
      { start: { x: 5, y: 5 }, end: { x: 6, y: 5 } },
    ]
    const result = greedyOptimizeOrder(units, { x: 0, y: 0 })
    expect(result.order).toEqual([1, 2, 0])
    expect(result.reversed).toEqual([false, false, false])
  })

  it('終点の方が近い場合は反転して採用する', () => {
    const units = [{ start: { x: 10, y: 0 }, end: { x: 1, y: 0 } }]
    const result = greedyOptimizeOrder(units, { x: 0, y: 0 })
    expect(result.order).toEqual([0])
    expect(result.reversed).toEqual([true])
  })

  it('並び替えと方向反転を独立して切り替えられる', () => {
    const units = [
      { start: { x: 10, y: 0 }, end: { x: 8, y: 0 } },
      { start: { x: 1, y: 0 }, end: { x: 2, y: 0 } },
    ]
    const start = { x: 0, y: 0 }
    expect(
      greedyOptimizeOrder(units, start, {
        reorderPaths: true,
        reversePaths: false,
      }),
    ).toEqual({
      order: [1, 0],
      reversed: [false, false],
    })
    expect(
      greedyOptimizeOrder(units, start, {
        reorderPaths: false,
        reversePaths: true,
      }),
    ).toEqual({
      order: [0, 1],
      reversed: [true, true],
    })
  })
})
