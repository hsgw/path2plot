import { memo, useCallback, useEffect, useState } from 'react'
import { resolveEffectiveFillSettings } from '../../core/fill/overrides'
import type { FillSettings } from '../../core/fill/types'
import type { HighlightSelection, ListEntry } from '../../core/plan/types'
import {
  FillOverridePopover,
  type FillOverridePopoverState,
} from './FillOverridePopover'
import { StrokeContextMenu, type ContextMenuState } from './StrokeContextMenu'
import { StrokeListRows } from './StrokeListRows'

interface StrokeListPanelProps {
  entries: ListEntry[]
  /** FR-23のステップ実行プレビューと連動させ、未描画の行を薄く表示する */
  step: number
  /** FR-14: 個別上書き(結合する/しない)の現在値。右クリックメニューの表示・操作に使う */
  joinOverrides: Map<string, boolean>
  onSetJoinOverride: (idA: string, idB: string, join: boolean) => void
  /** 塗りつぶしのグローバル設定。個別編集ポップオーバーの実効値計算に使う */
  fillSettings: FillSettings
  /** fill個別上書きの現在値(fillId→上書きpatch) */
  fillOverrides: Map<string, Partial<FillSettings>>
  onPatchFillOverride: (fillId: string, patch: Partial<FillSettings>) => void
  onResetFillOverride: (fillId: string) => void
  /** FR-43: クリックで選択中の行のキー(ホバー中の行はCSSの:hoverで表現するため受け取らない) */
  selectedKey: string | null
  onHover: (selection: HighlightSelection | null) => void
  onSelect: (selection: HighlightSelection) => void
}

// 参照を使い回し、展開状態リセット時に不要な再レンダを起こさないようにする
const EMPTY_EXPANDED: ReadonlySet<string> = new Set()

/**
 * FR-43: 選択中・メニュー対象の行だけにマッチするCSSルールを組み立てる。
 * classNameで表現するとリスト全体の再レンダが必要になるため、属性セレクタで差し込む
 * (色の定義はApp.css側の変数)
 */
function buildRowRules(
  selectedKey: string | null,
  contextMenuKey: string | null,
): string {
  const rules: string[] = []
  if (selectedKey !== null) {
    rules.push(
      `.stroke-list [data-hl-key="${selectedKey}"]{background:var(--highlight-selected-bg);box-shadow:inset 2px 0 0 var(--highlight-selected-bar)}`,
      `.stroke-list [data-hl-key="${selectedKey}"].stroke-list-item-pending{opacity:0.75}`,
    )
  }
  if (contextMenuKey !== null) {
    rules.push(
      `.stroke-list [data-hl-key="${contextMenuKey}"]{outline:1px dashed var(--highlight-selected-bar);outline-offset:-1px;opacity:1}`,
    )
  }
  return rules.join('')
}

function StrokeListPanelImpl({
  entries,
  step,
  joinOverrides,
  onSetJoinOverride,
  fillSettings,
  fillOverrides,
  onPatchFillOverride,
  onResetFillOverride,
  selectedKey,
  onHover,
  onSelect,
}: StrokeListPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [expandedKeys, setExpandedKeys] =
    useState<ReadonlySet<string>>(EMPTY_EXPANDED)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [fillPopover, setFillPopover] =
    useState<FillOverridePopoverState | null>(null)
  // コピー元をまたいだファイル切替は意味が薄いため、パネル内のローカルstateとして保持する
  const [clipboardFillSettings, setClipboardFillSettings] =
    useState<FillSettings | null>(null)

  // 並び替え・パス結合・塗り設定変更等でリスト構成が変わったら、既定の「畳まれた状態」に戻し、
  // 行の対応が取れなくなった右クリックメニューも閉じる
  useEffect(() => {
    setExpandedKeys((prev) => (prev.size === 0 ? prev : EMPTY_EXPANDED))
    setContextMenu(null)
  }, [entries])

  // 個別編集ポップオーバーは編集中のfill設定変更自体でentriesが更新され続けるため、
  // entries変化のたびには閉じない。対象のfillId自体が消えた場合(ファイル再読込等)だけ閉じる
  useEffect(() => {
    if (fillPopover === null) return
    const stillExists = entries.some(
      (e) => e.kind === 'fill' && e.id === fillPopover.fillId,
    )
    if (!stillExists) setFillPopover(null)
  }, [entries, fillPopover])

  const handleToggleExpanded = useCallback((key: string): void => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }, [])

  const handleContextMenu = useCallback(
    (target: HighlightSelection, clientX: number, clientY: number): void => {
      setContextMenu({ x: clientX, y: clientY, target })
    },
    [],
  )
  const handleCloseContextMenu = useCallback((): void => {
    setContextMenu(null)
  }, [])

  const handleEditFillSettings = useCallback(
    (fillId: string): void => {
      if (contextMenu === null) return
      const entry = entries.find((e) => e.kind === 'fill' && e.id === fillId)
      setFillPopover({
        x: contextMenu.x,
        y: contextMenu.y,
        fillId,
        fillLabel: entry?.sourceId ?? fillId,
      })
    },
    [contextMenu, entries],
  )
  const handleCloseFillPopover = useCallback((): void => {
    setFillPopover(null)
  }, [])
  const handleCopyFillSettings = useCallback(
    (fillId: string): void => {
      setClipboardFillSettings(
        resolveEffectiveFillSettings(fillSettings, fillOverrides.get(fillId)),
      )
    },
    [fillSettings, fillOverrides],
  )
  const handlePasteFillSettings = useCallback(
    (fillId: string): void => {
      if (clipboardFillSettings === null) return
      onPatchFillOverride(fillId, clipboardFillSettings)
    },
    [clipboardFillSettings, onPatchFillOverride],
  )

  const rowRules = buildRowRules(selectedKey, contextMenu?.target.key ?? null)

  return (
    <section
      className={`panel panel-stroke-list${isOpen ? '' : ' panel-collapsed'}`}
    >
      {rowRules !== '' && <style>{rowRules}</style>}
      <div className="panel-header">
        <button type="button" onClick={() => setIsOpen((v) => !v)}>
          {isOpen ? '»' : '«'}
        </button>
        {isOpen && <h2>ストローク並び順</h2>}
      </div>
      {isOpen && (
        <div className="panel-body">
          <StrokeListRows
            entries={entries}
            step={step}
            expandedKeys={expandedKeys}
            onToggleExpanded={handleToggleExpanded}
            onHover={onHover}
            onSelect={onSelect}
            onContextMenu={handleContextMenu}
            onResetFillOverride={onResetFillOverride}
          />
          {contextMenu !== null && (
            <StrokeContextMenu
              state={contextMenu}
              entries={entries}
              joinOverrides={joinOverrides}
              onSetJoinOverride={onSetJoinOverride}
              canPasteFillSettings={clipboardFillSettings !== null}
              onEditFillSettings={handleEditFillSettings}
              onResetFillOverride={onResetFillOverride}
              onCopyFillSettings={handleCopyFillSettings}
              onPasteFillSettings={handlePasteFillSettings}
              onClose={handleCloseContextMenu}
            />
          )}
          {fillPopover !== null && (
            <FillOverridePopover
              state={fillPopover}
              globalSettings={fillSettings}
              override={fillOverrides.get(fillPopover.fillId)}
              onPatchOverride={onPatchFillOverride}
              onResetOverride={onResetFillOverride}
              onClose={handleCloseFillPopover}
            />
          )}
        </div>
      )}
    </section>
  )
}

export const StrokeListPanel = memo(StrokeListPanelImpl)
