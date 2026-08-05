import { describe, expect, it } from 'vitest'
import type { FillBlock } from '../fill/types'
import type { Point } from '../geometry/types'
import type { ParsedStroke } from '../svg/types'
import { buildDrawPlan } from './drawPlan'
import { toDrawUnits } from './drawUnit'
import { optimizeDrawOrder } from './optimizeOrder'
import type { JoinedBlock } from './types'

const ORIGIN: Point = { x: 0, y: 0 }

function line(points: [number, number][]): Point[] {
  return points.map(([x, y]) => ({ x, y }))
}

function fill(
  id: string,
  fillChains: [number, number][][],
  outlineLoops: [number, number][][] | null = null,
): FillBlock {
  return {
    id,
    color: '#f00',
    outlineLoops: outlineLoops === null ? null : outlineLoops.map(line),
    fillChains: fillChains.map(line),
  }
}

describe('optimizeDrawOrder', () => {
  it('塗りブロック内部の塗り線を、ブロック到達点からの最近傍順に並べ替える', () => {
    const units = toDrawUnits(
      [],
      [
        fill('f0', [
          [
            [10, 0],
            [11, 0],
          ],
          [
            [1, 0],
            [2, 0],
          ],
        ]),
      ],
    )

    const result = optimizeDrawOrder(units, [], ORIGIN)

    expect(result.order).toEqual([0])
    expect(result.innerOrders?.[0]).toEqual({
      order: [1, 0],
      reversed: [false, false],
    })
  })

  it('終点の方が近い塗り線は向きを反転して描く', () => {
    const units = toDrawUnits(
      [],
      [
        fill('f0', [
          [
            [5, 0],
            [1, 0],
          ],
        ]),
      ],
    )

    const result = optimizeDrawOrder(units, [], ORIGIN)

    expect(result.innerOrders?.[0]).toEqual({ order: [0], reversed: [true] })
  })

  it('輪郭線は塗り線より先に描く順序を保ったまま、グループ内だけ並べ替える', () => {
    const units = toDrawUnits(
      [],
      [
        fill(
          'f0',
          [
            [
              [1, 0],
              [2, 0],
            ],
          ],
          [
            [
              [20, 0],
              [21, 0],
              [20, 0],
            ],
            [
              [10, 0],
              [11, 0],
              [10, 0],
            ],
          ],
        ),
      ],
    )

    const result = optimizeDrawOrder(units, [], ORIGIN)

    // 添字0,1が輪郭線、2が塗り線。輪郭線同士は近い順(1→0)に入れ替わるが、塗り線は最後のまま
    expect(result.innerOrders?.[0]?.order).toEqual([1, 0, 2])
  })

  it('塗りブロックの内部最適化後の出口を、次のユニットを選ぶ現在地に使う', () => {
    const strokes: ParsedStroke[] = [
      {
        id: 'near',
        points: line([
          [3, 0],
          [4, 0],
        ]),
        color: '#000',
      },
      {
        id: 'far',
        points: line([
          [30, 0],
          [31, 0],
        ]),
        color: '#000',
      },
    ]
    const blocks: JoinedBlock[] = [
      { members: [{ strokeIndex: 0, reversed: false }] },
      { members: [{ strokeIndex: 1, reversed: false }] },
    ]
    // 塗り線は生成順では遠い側が先。内部最適化により出口は(20,0)側になる
    const fillBlock = fill('f0', [
      [
        [20, 0],
        [21, 0],
      ],
      [
        [10, 0],
        [11, 0],
      ],
    ])
    const units = toDrawUnits(blocks, [fillBlock])

    const result = optimizeDrawOrder(units, strokes, ORIGIN)

    // near(0) → fill(2) → far(1)。fillの出口(21,0)から見てfarの方が近い
    expect(result.order).toEqual([0, 2, 1])
    expect(result.innerOrders).toEqual([
      null,
      { order: [1, 0], reversed: [false, false] },
      null,
    ])
  })

  it('内部並び替え結果はG-code出力のセグメント順に反映される', () => {
    const units = toDrawUnits(
      [],
      [
        fill('f0', [
          [
            [10, 0],
            [11, 0],
          ],
          [
            [1, 0],
            [2, 0],
          ],
        ]),
      ],
    )
    const order = optimizeDrawOrder(units, [], ORIGIN)

    const plan = buildDrawPlan(units, [], order, new Map(), new Set())

    expect(plan.drawGroups.map((g) => g[0])).toEqual([
      { x: 1, y: 0 },
      { x: 10, y: 0 },
    ])
    // fill行の本数表記・ステップ換算(1ブロック=1行)は内部並び替えの影響を受けない
    expect(plan.listEntries).toHaveLength(1)
    expect(plan.segmentCountPrefix).toEqual([0, 2])
  })
})
