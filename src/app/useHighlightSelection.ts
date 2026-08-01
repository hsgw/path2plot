import { useCallback, useEffect, useMemo, useState } from 'react'
import { toHighlightRange } from '../core/plan/highlight'
import type {
  HighlightRange,
  HighlightSelection,
  ListEntry,
} from '../core/plan/types'

export interface HighlightState {
  /** 選択中の行のキー(リスト側の見た目に使う) */
  selectedKey: string | null
  hoverHighlight: HighlightRange | null
  selectedHighlight: HighlightRange | null
  onHover: (selection: HighlightSelection | null) => void
  onSelect: (selection: HighlightSelection) => void
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
    hoverHighlight,
    selectedHighlight,
    onHover,
    onSelect,
  }
}
