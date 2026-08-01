import { describe, expect, it } from 'vitest'
import { toHighlightRange } from './highlight'

// 3行のリスト: 1本のストローク・3セグメントの塗り・1本のストローク
const prefix = [0, 1, 4, 5]

describe('toHighlightRange', () => {
  it('選択なしはnull', () => {
    expect(toHighlightRange(null, prefix)).toBeNull()
  })

  it('1行の選択をその行のセグメント範囲に変換する', () => {
    expect(
      toHighlightRange({ key: 'k', entryIndex: 1, entryCount: 1 }, prefix),
    ).toEqual({ start: 1, end: 4 })
  })

  it('結合ブロック行(複数エントリ)は全体をまとめた範囲になる', () => {
    expect(
      toHighlightRange({ key: 'k', entryIndex: 0, entryCount: 3 }, prefix),
    ).toEqual({ start: 0, end: 5 })
  })

  it('塗りブロック内の1本はsegmentOffsetで1セグメントだけを指す', () => {
    expect(
      toHighlightRange(
        { key: 'k', entryIndex: 1, entryCount: 1, segmentOffset: 2 },
        prefix,
      ),
    ).toEqual({ start: 3, end: 4 })
  })

  it('リスト再構築で範囲外になった選択はnull(範囲外参照を避ける)', () => {
    expect(
      toHighlightRange({ key: 'k', entryIndex: 5, entryCount: 1 }, prefix),
    ).toBeNull()
    expect(
      toHighlightRange(
        { key: 'k', entryIndex: 1, entryCount: 1, segmentOffset: 9 },
        prefix,
      ),
    ).toBeNull()
  })
})
