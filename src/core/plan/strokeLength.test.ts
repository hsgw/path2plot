import { describe, expect, it } from 'vitest'
import type { ParsedStroke } from '../svg/types'
import type { JoinedBlock } from './types'
import { buildJoinedBlocks } from './strokeJoin'
import { filterJoinedBlocksByMinimumLength } from './strokeLength'

const stroke = (id: string, points: [number, number][]): ParsedStroke => ({
  id,
  color: '#000',
  points: points.map(([x, y]) => ({ x, y })),
})

const block = (...strokeIndices: number[]): JoinedBlock => ({
  members: strokeIndices.map((strokeIndex) => ({
    strokeIndex,
    reversed: false,
  })),
})

describe('filterJoinedBlocksByMinimumLength', () => {
  it('短いストロークも結合候補に残し、結合ブロック全体の長さで判定する', () => {
    const strokes = [
      stroke('a', [
        [0, 0],
        [0.5, 0],
      ]),
      stroke('b', [
        [0.5, 0],
        [1, 0],
      ]),
    ]
    const joinedBlocks = buildJoinedBlocks(strokes, 0.01, new Map())
    expect(joinedBlocks).toHaveLength(1)
    expect(joinedBlocks[0].members).toHaveLength(2)
    expect(
      filterJoinedBlocksByMinimumLength(joinedBlocks, strokes, 0.9),
    ).toEqual(joinedBlocks)
  })

  it('結合されない短いブロックを除外し、閾値と同じ長さは残す', () => {
    const strokes = [
      stroke('short', [
        [0, 0],
        [0.5, 0],
      ]),
      stroke('equal', [
        [2, 0],
        [3, 0],
      ]),
    ]
    expect(
      filterJoinedBlocksByMinimumLength([block(0), block(1)], strokes, 1),
    ).toEqual([block(1)])
  })

  it('ブロック全体の経路長にストローク間の接続距離を含める', () => {
    const strokes = [
      stroke('a', [
        [0, 0],
        [1, 0],
      ]),
      stroke('b', [
        [1.5, 0],
        [2.5, 0],
      ]),
    ]
    const blocks = [block(0, 1)]
    expect(filterJoinedBlocksByMinimumLength(blocks, strokes, 2.4)).toEqual(
      blocks,
    )
    expect(filterJoinedBlocksByMinimumLength(blocks, strokes, 2.6)).toEqual([])
  })

  it('閾値0では全ブロックを保持する', () => {
    const blocks = [block(0)]
    expect(
      filterJoinedBlocksByMinimumLength(
        blocks,
        [
          stroke('zero', [
            [0, 0],
            [0, 0],
          ]),
        ],
        0,
      ),
    ).toBe(blocks)
  })
})
