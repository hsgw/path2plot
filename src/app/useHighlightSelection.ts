import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildEntryGroupIndex,
  entryIndexForSegment,
  selectionForGroup,
  toHighlightRange,
} from '../core/plan/highlight'
import type {
  HighlightRange,
  HighlightSelection,
  ListEntry,
} from '../core/plan/types'

export interface HighlightState {
  /** 選択中の行のキー(リスト側の見た目に使う) */
  selectedKey: string | null
  /** ホバー中の行のキー(プレビュー発のホバーをリスト側で強調するのに使う) */
  hoverKey: string | null
  hoverHighlight: HighlightRange | null
  selectedHighlight: HighlightRange | null
  onHover: (selection: HighlightSelection | null) => void
  onSelect: (selection: HighlightSelection) => void
  /** FR-43: プレビュー上でヒットした物理セグメント番号からリスト行を逆引きしてホバー/選択する */
  onSegmentHover: (segmentIndex: number | null) => void
  onSegmentSelect: (segmentIndex: number) => void
}

/**
 * FR-43: ストローク並び順リストのホバー/選択と、プレビューのハイライト表示を同期する。
 * リスト構成が変わった時点で対応が取れなくなるため、両方とも解除する。
 */
export function useHighlightSelection(
  listEntries: ListEntry[],
  segmentCountPrefix: number[],
): HighlightState {
  const [hovered, setHovered] = useState<HighlightSelection | null>(null)
  const [selected, setSelected] = useState<HighlightSelection | null>(null)

  useEffect(() => {
    setHovered(null)
    setSelected(null)
  }, [listEntries])

  // ホバーはmousemove相当の頻度で通知されるため、同じ行のままなら前の状態をそのまま返して
  // 再レンダ自体を起こさない。選択は同じ行の再クリックで解除する
  const onHover = useCallback((next: HighlightSelection | null): void => {
    setHovered((prev) =>
      (prev?.key ?? null) === (next?.key ?? null) ? prev : next,
    )
  }, [])
  const onSelect = useCallback((next: HighlightSelection): void => {
    setSelected((prev) => (prev?.key === next.key ? null : next))
  }, [])

  // FR-43(プレビュー→リスト方向): 物理セグメント番号→ListEntry添字→行のグループを都度引くための索引
  const entryGroupIndex = useMemo(
    () => buildEntryGroupIndex(listEntries),
    [listEntries],
  )
  const segmentToSelection = useCallback(
    (segmentIndex: number): HighlightSelection | null => {
      const entryIndex = entryIndexForSegment(segmentIndex, segmentCountPrefix)
      const group = entryIndex < 0 ? undefined : entryGroupIndex[entryIndex]
      return group ? selectionForGroup(group) : null
    },
    [entryGroupIndex, segmentCountPrefix],
  )
  const onSegmentHover = useCallback(
    (segmentIndex: number | null): void => {
      onHover(segmentIndex === null ? null : segmentToSelection(segmentIndex))
    },
    [onHover, segmentToSelection],
  )
  const onSegmentSelect = useCallback(
    (segmentIndex: number): void => {
      const selection = segmentToSelection(segmentIndex)
      if (selection) onSelect(selection)
    },
    [onSelect, segmentToSelection],
  )

  const hoverHighlight = useMemo(
    () => toHighlightRange(hovered, segmentCountPrefix),
    [hovered, segmentCountPrefix],
  )
  const selectedHighlight = useMemo(
    () => toHighlightRange(selected, segmentCountPrefix),
    [selected, segmentCountPrefix],
  )

  return {
    selectedKey: selected?.key ?? null,
    hoverKey: hovered?.key ?? null,
    hoverHighlight,
    selectedHighlight,
    onHover,
    onSelect,
    onSegmentHover,
    onSegmentSelect,
  }
}
