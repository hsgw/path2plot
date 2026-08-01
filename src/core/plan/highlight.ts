import type { HighlightRange, HighlightSelection } from './types'

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
