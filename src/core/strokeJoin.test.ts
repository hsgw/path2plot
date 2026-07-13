import { describe, expect, it } from 'vitest'
import type { ParsedStroke } from '../types/svg'
import {
  buildJoinedBlocks,
  greedyOptimizeOrder,
  joinOverrideKey,
  materializeBlock,
} from './strokeJoin'

function stroke(id: string, points: [number, number][]): ParsedStroke {
  return {
    id,
    points: points.map(([x, y]) => ({ x, y })),
    color: '#000',
  }
}

describe('buildJoinedBlocks', () => {
  it('端点が0.5mm以内の3ストロークを1ブロックにチェーンする(近い順)', () => {
    const strokes = [
      stroke('a', [
        [10, 20],
        [50, 20],
      ]),
      stroke('b', [
        [50.3, 20.1],
        [90, 20],
      ]),
      stroke('c', [
        [90.2, 20],
        [130, 19.9],
      ]),
    ]
    const blocks = buildJoinedBlocks(strokes, 0.5, new Map())
    expect(blocks).toHaveLength(1)
    expect(blocks[0].members).toEqual([
      { strokeIndex: 0, reversed: false },
      { strokeIndex: 1, reversed: false },
      { strokeIndex: 2, reversed: false },
    ])
  })

  it('2mmギャップのストロークは結合しない', () => {
    const strokes = [
      stroke('a', [
        [10, 60],
        [50, 60],
      ]),
      stroke('b', [
        [52, 60],
        [90, 60],
      ]),
    ]
    const blocks = buildJoinedBlocks(strokes, 0.5, new Map())
    expect(blocks).toHaveLength(2)
    expect(blocks[0].members).toEqual([{ strokeIndex: 0, reversed: false }])
    expect(blocks[1].members).toEqual([{ strokeIndex: 1, reversed: false }])
  })

  it('overrideで閾値超のペアを強制結合できる', () => {
    const strokes = [
      stroke('a', [
        [10, 60],
        [50, 60],
      ]),
      stroke('b', [
        [52, 60],
        [90, 60],
      ]),
    ]
    const overrides = new Map([[joinOverrideKey('a', 'b'), true]])
    const blocks = buildJoinedBlocks(strokes, 0.5, overrides)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].members).toEqual([
      { strokeIndex: 0, reversed: false },
      { strokeIndex: 1, reversed: false },
    ])
  })

  it('overrideで閾値内のペアを強制非結合にできる', () => {
    const strokes = [
      stroke('a', [
        [10, 20],
        [50, 20],
      ]),
      stroke('b', [
        [50.3, 20.1],
        [90, 20],
      ]),
    ]
    const overrides = new Map([[joinOverrideKey('a', 'b'), false]])
    const blocks = buildJoinedBlocks(strokes, 0.5, overrides)
    expect(blocks).toHaveLength(2)
  })

  it('端点近接が閉ループを形成する場合でも無限ループせず全ストロークを1ブロックにまとめる', () => {
    const strokes = [
      stroke('a', [
        [0, 0],
        [10, 0],
      ]),
      stroke('b', [
        [10, 0.1],
        [10, 10],
      ]),
      stroke('c', [
        [10.1, 10],
        [0, 10],
      ]),
      stroke('d', [
        [0, 10.1],
        [0, 0.1],
      ]),
    ]
    const blocks = buildJoinedBlocks(strokes, 0.5, new Map())
    expect(blocks).toHaveLength(1)
    const indices = blocks[0].members.map((m) => m.strokeIndex).sort()
    expect(indices).toEqual([0, 1, 2, 3])
  })
})

describe('materializeBlock', () => {
  it('overallReversed=falseのときそのままの向きで連結する', () => {
    const strokes = [
      stroke('a', [
        [0, 0],
        [10, 0],
      ]),
      stroke('b', [
        [10, 0],
        [20, 0],
      ]),
    ]
    const block = {
      members: [
        { strokeIndex: 0, reversed: false },
        { strokeIndex: 1, reversed: false },
      ],
    }
    const result = materializeBlock(block, strokes, false)
    expect(result.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ])
  })

  it('overallReversed=trueのときメンバー順序・各点列を反転する', () => {
    const strokes = [
      stroke('a', [
        [0, 0],
        [10, 0],
      ]),
      stroke('b', [
        [10, 0],
        [20, 0],
      ]),
    ]
    const block = {
      members: [
        { strokeIndex: 0, reversed: false },
        { strokeIndex: 1, reversed: false },
      ],
    }
    const result = materializeBlock(block, strokes, true)
    expect(result.points).toEqual([
      { x: 20, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ])
  })
})

describe('greedyOptimizeOrder', () => {
  it('開始点から最近傍のユニットを逐次選択する', () => {
    const units = [
      {
        points: [
          { x: 100, y: 100 },
          { x: 101, y: 101 },
        ],
      },
      {
        points: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
      {
        points: [
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ],
      },
    ]
    const result = greedyOptimizeOrder(units, { x: 0, y: 0 })
    expect(result.order).toEqual([1, 2, 0])
    expect(result.reversed).toEqual([false, false, false])
  })

  it('終点の方が近い場合は反転して採用する', () => {
    const units = [
      {
        points: [
          { x: 10, y: 0 },
          { x: 1, y: 0 },
        ],
      },
    ]
    const result = greedyOptimizeOrder(units, { x: 0, y: 0 })
    expect(result.order).toEqual([0])
    expect(result.reversed).toEqual([true])
  })
})
