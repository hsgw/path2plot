import { describe, expect, it } from 'vitest'
import type { FillBlock } from '../fill/types'
import type { ParsedStroke } from '../svg/types'
import { buildDrawPlan } from './drawPlan'
import { toDrawUnits } from './drawUnit'
import type { JoinedBlock } from './types'

function stroke(id: string, points: [number, number][]): ParsedStroke {
  return { id, points: points.map(([x, y]) => ({ x, y })), color: '#000' }
}

const strokes: ParsedStroke[] = [
  stroke('a', [
    [0, 0],
    [10, 0],
  ]),
  stroke('b', [
    [10, 0],
    [20, 0],
  ]),
  stroke('c', [
    [50, 50],
    [60, 50],
  ]),
]

/** a+bを1ブロック、cを単独ブロックとする */
const blocks: JoinedBlock[] = [
  {
    members: [
      { strokeIndex: 0, reversed: false },
      { strokeIndex: 1, reversed: false },
    ],
  },
  { members: [{ strokeIndex: 2, reversed: false }] },
]

const fillBlock: FillBlock = {
  id: 'fill-0',
  color: '#f00',
  outlineLoops: [
    [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 0, y: 0 },
    ],
  ],
  fillChains: [
    [
      { x: 1, y: 1 },
      { x: 4, y: 1 },
    ],
    [
      { x: 1, y: 2 },
      { x: 4, y: 2 },
    ],
  ],
}

describe('buildDrawPlan', () => {
  it('結合ブロックはストロークごとに行を作り、先頭だけがペンアップ移動を伴う', () => {
    const plan = buildDrawPlan(toDrawUnits(blocks, []), strokes, null, 'ハッチ')

    expect(plan.listEntries.map((e) => e.kind)).toEqual([
      'stroke',
      'stroke',
      'stroke',
    ])
    expect(plan.listEntries.map((e) => e.blockId)).toEqual([0, 0, 1])
    expect(plan.previewSegments.map((s) => s.penLiftBefore)).toEqual([
      true,
      false,
      true,
    ])
    // G-code出力は結合ブロックごとに1回のペンダウン〜アップ
    expect(plan.drawGroups).toHaveLength(2)
    expect(plan.drawGroups[0]).toHaveLength(4)
    expect(plan.counts).toEqual({
      strokeCount: 3,
      fillCount: 0,
      fillStrokeCount: 0,
    })
  })

  it('塗りブロックは1行にまとめ、輪郭線+塗り線の本数分のセグメントを持つ', () => {
    const plan = buildDrawPlan(
      toDrawUnits([], [fillBlock]),
      strokes,
      null,
      'ハッチ/往復',
    )

    expect(plan.listEntries).toHaveLength(1)
    const entry = plan.listEntries[0]
    expect(entry.kind === 'fill' && entry.patternLabel).toBe('ハッチ/往復')
    expect(entry.kind === 'fill' && entry.outlineLoopCount).toBe(1)
    expect(entry.kind === 'fill' && entry.fillChainCount).toBe(2)
    // 1行=3セグメント(輪郭線1+塗り線2)なので、累積和は0→3
    expect(plan.segmentCountPrefix).toEqual([0, 3])
    expect(plan.previewSegments).toHaveLength(3)
    expect(plan.counts).toEqual({
      strokeCount: 3,
      fillCount: 1,
      fillStrokeCount: 3,
    })
  })

  it('並び替え結果の順序・向き反転を反映する', () => {
    const plan = buildDrawPlan(
      toDrawUnits(blocks, []),
      strokes,
      { order: [1, 0], reversed: [false, true] },
      'ハッチ',
    )

    // 単独ブロック(c)が先、続いて反転したa+bブロック
    expect(plan.listEntries.map((e) => e.id)).toEqual(['c', 'b', 'a'])
    expect(plan.drawGroups[1][0]).toEqual({ x: 20, y: 0 })
  })

  it('ユニット数と長さが合わない並び替え結果は破棄して出現順に戻す', () => {
    const plan = buildDrawPlan(
      toDrawUnits(blocks, []),
      strokes,
      { order: [0, 1, 2, 3], reversed: [false, false, false, false] },
      'ハッチ',
    )

    expect(plan.listEntries.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('段階表示用の累積和は行数+1の長さで単調増加する', () => {
    const plan = buildDrawPlan(
      toDrawUnits(blocks, [fillBlock]),
      strokes,
      null,
      'ハッチ',
    )

    expect(plan.segmentCountPrefix).toHaveLength(plan.listEntries.length + 1)
    expect(plan.segmentCountPrefix.at(-1)).toBe(plan.previewSegments.length)
  })
})
