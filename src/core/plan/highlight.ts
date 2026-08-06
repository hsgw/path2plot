import type {
  FillListEntry,
  HighlightRange,
  HighlightSelection,
  ListEntry,
  StrokeListEntry,
} from './types'

/**
 * FR-43のハイライト行キー。行の種別ごとに接頭辞を付け、同じidを持つ行
 * (block行とその先頭ストローク行など)が衝突しないようにする
 */
export const strokeRowKey = (id: string): string => `stroke:${id}`
export const blockRowKey = (id: string): string => `block:${id}`
export const fillRowKey = (id: string): string => `fill:${id}`
export const fillChildRowKey = (id: string, segmentOffset: number): string =>
  `fillchild:${id}:${segmentOffset}`

/**
 * FR-40の階層表示用に、フラットなListEntry列をブロック単位へまとめたもの。
 * blockは同一結合ブロックに属する連続したstroke行、fillは塗りブロック1つ。
 * 単独ストローク(結合されていないblock)はblockとして扱いつつ、行の見た目は個別ストロークのままとする
 */
export type ListGroup =
  | {
      kind: 'block'
      key: string
      /** グループ先頭がListEntry全体の何番目か(FR-43のハイライト範囲換算に使う) */
      startIndex: number
      entries: StrokeListEntry[]
    }
  | { kind: 'fill'; key: string; index: number; entry: FillListEntry }

export function groupEntries(entries: ListEntry[]): ListGroup[] {
  const result: ListGroup[] = []
  entries.forEach((entry, index) => {
    if (entry.kind === 'fill') {
      result.push({ kind: 'fill', key: entry.id, index, entry })
      return
    }
    const last = result.at(-1)
    if (last?.kind === 'block' && last.entries[0].blockId === entry.blockId) {
      last.entries.push(entry)
      return
    }
    result.push({
      kind: 'block',
      key: entry.id,
      startIndex: index,
      entries: [entry],
    })
  })
  return result
}

/** groupEntriesの結果を、行(list行のリスト表示単位)がリスト上でハイライト対象になったときの選択情報へ変換する */
export function selectionForGroup(group: ListGroup): HighlightSelection {
  if (group.kind === 'fill') {
    return {
      key: fillRowKey(group.entry.id),
      entryIndex: group.index,
      entryCount: 1,
    }
  }
  if (group.entries.length === 1) {
    return {
      key: strokeRowKey(group.entries[0].id),
      entryIndex: group.startIndex,
      entryCount: 1,
    }
  }
  return {
    key: blockRowKey(group.key),
    entryIndex: group.startIndex,
    entryCount: group.entries.length,
  }
}

/**
 * FR-43(プレビュー→リスト方向): entries[i]がどのグループ(行)に属するかをO(1)で引けるよう、
 * entries と同じ長さの配列として持つ
 */
export function buildEntryGroupIndex(entries: ListEntry[]): ListGroup[] {
  const groups = groupEntries(entries)
  const index: ListGroup[] = new Array(entries.length)
  for (const group of groups) {
    if (group.kind === 'fill') {
      index[group.index] = group
      continue
    }
    for (let i = 0; i < group.entries.length; i++) {
      index[group.startIndex + i] = group
    }
  }
  return index
}

/**
 * FR-43(プレビュー→リスト方向): プレビュー上でヒットした物理セグメント番号から、
 * それが属するListEntryの添字を求める(segmentCountPrefix[i] <= segmentIndex < segmentCountPrefix[i+1])。
 * 見つからなければ-1
 */
export function entryIndexForSegment(
  segmentIndex: number,
  segmentCountPrefix: number[],
): number {
  let lo = 0
  let hi = segmentCountPrefix.length - 2
  if (hi < 0 || segmentIndex < 0) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (segmentCountPrefix[mid] <= segmentIndex) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  if (
    segmentIndex < segmentCountPrefix[lo] ||
    segmentIndex >= segmentCountPrefix[lo + 1]
  ) {
    return -1
  }
  return lo
}

/**
 * FR-43: リストの行(ListEntry単位)を、プレビューのセグメント範囲[start, end)に変換する。
 * segmentCountPrefixはDrawPlanが持つListEntryごとのセグメント本数の累積和。
 * リスト再構築の直後に古い選択が残っていても範囲外参照にならないよう、
 * 範囲外はnull(ハイライトなし)として扱う。
 */
export function toHighlightRange(
  selection: HighlightSelection | null,
  segmentCountPrefix: number[],
): HighlightRange | null {
  if (selection === null) return null
  const endEntry = selection.entryIndex + selection.entryCount
  if (selection.entryIndex < 0 || endEntry >= segmentCountPrefix.length) {
    return null
  }
  const base = segmentCountPrefix[selection.entryIndex]
  if (selection.segmentOffset === undefined) {
    return { start: base, end: segmentCountPrefix[endEntry] }
  }
  // 塗りブロック内の1本(輪郭線・ハッチ線)を指す場合
  const start = base + selection.segmentOffset
  if (start >= segmentCountPrefix[endEntry]) return null
  return { start, end: start + 1 }
}
