import { describe, expect, it } from 'vitest'
import {
  buildEntryGroupIndex,
  entryIndexForSegment,
  groupEntries,
  selectionForGroup,
  toHighlightRange,
} from './highlight'
import type { FillListEntry, StrokeListEntry } from './types'

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

describe('entryIndexForSegment', () => {
  it('セグメント番号が属するListEntryの添字を返す', () => {
    expect(entryIndexForSegment(0, prefix)).toBe(0)
    expect(entryIndexForSegment(1, prefix)).toBe(1)
    expect(entryIndexForSegment(3, prefix)).toBe(1)
    expect(entryIndexForSegment(4, prefix)).toBe(2)
  })

  it('セグメント本数0のエントリはスキップされる(飛び越えて次のエントリを返す)', () => {
    // 2番目のエントリ(index 1)がセグメント0本(塗りのエラー時など)
    const withEmpty = [0, 1, 1, 4]
    expect(entryIndexForSegment(1, withEmpty)).toBe(2)
  })

  it('範囲外は-1', () => {
    expect(entryIndexForSegment(-1, prefix)).toBe(-1)
    expect(entryIndexForSegment(5, prefix)).toBe(-1)
    expect(entryIndexForSegment(0, [])).toBe(-1)
  })
})

function stroke(id: string, blockId: number): StrokeListEntry {
  return { kind: 'stroke', id, blockId, points: [], color: '#000' }
}

function fill(id: string): FillListEntry {
  return {
    kind: 'fill',
    blockId: 99,
    id,
    color: '#000',
    patternLabel: '',
    fillChainCount: 0,
    outlineLoopCount: 0,
    overridden: false,
  }
}

describe('groupEntries / selectionForGroup', () => {
  it('同一blockIdの連続したstroke行は1つのblockグループにまとまる', () => {
    const entries = [stroke('a', 1), stroke('b', 1), fill('f'), stroke('c', 2)]
    const groups = groupEntries(entries)
    expect(groups).toEqual([
      {
        kind: 'block',
        key: 'a',
        startIndex: 0,
        entries: [entries[0], entries[1]],
      },
      { kind: 'fill', key: 'f', index: 2, entry: entries[2] },
      { kind: 'block', key: 'c', startIndex: 3, entries: [entries[3]] },
    ])
  })

  it('単独ストロークのグループはstroke:idの選択情報になる', () => {
    const group = groupEntries([stroke('c', 2)])[0]
    expect(selectionForGroup(group)).toEqual({
      key: 'stroke:c',
      entryIndex: 0,
      entryCount: 1,
    })
  })

  it('複数本の結合ブロックはblock:先頭idの選択情報になる', () => {
    const group = groupEntries([stroke('a', 1), stroke('b', 1)])[0]
    expect(selectionForGroup(group)).toEqual({
      key: 'block:a',
      entryIndex: 0,
      entryCount: 2,
    })
  })

  it('fill行はfill:idの選択情報になる', () => {
    const group = groupEntries([fill('f')])[0]
    expect(selectionForGroup(group)).toEqual({
      key: 'fill:f',
      entryIndex: 0,
      entryCount: 1,
    })
  })
})

describe('buildEntryGroupIndex', () => {
  it('各エントリ添字から所属グループを引ける索引を作る', () => {
    const entries = [stroke('a', 1), stroke('b', 1), fill('f')]
    const index = buildEntryGroupIndex(entries)
    expect(index[0]).toBe(index[1])
    expect(index[0].key).toBe('a')
    expect(index[2].key).toBe('f')
  })
})
