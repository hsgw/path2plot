import {
  memo,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
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
  /** FR-43: クリックで選択中の行のキー(リスト内マウス由来のホバーはCSSの:hoverで表現する) */
  selectedKey: string | null
  /** プレビュー側でホバー中のセグメントに対応する行のキー。リスト内マウス由来のホバーは
   * :hoverが担うため、こちらはプレビュー発のホバーだけを属性セレクタで表現する */
  previewHoverKey: string | null
  onHover: (selection: HighlightSelection | null) => void
  onSelect: (selection: HighlightSelection) => void
}

// 参照を使い回し、展開状態リセット時に不要な再レンダを起こさないようにする
const EMPTY_EXPANDED: ReadonlySet<string> = new Set()

const DEFAULT_PANEL_WIDTH = 280
const MIN_PANEL_WIDTH = 220
const MAX_PANEL_WIDTH = 640

/**
 * FR-43: 選択中・メニュー対象の行だけにマッチするCSSルールを組み立てる。
 * classNameで表現するとリスト全体の再レンダが必要になるため、属性セレクタで差し込む
 * (色の定義はApp.css側の変数)
 */
function buildRowRules(
  selectedKey: string | null,
  previewHoverKey: string | null,
  contextMenuKey: string | null,
): string {
  const rules: string[] = []
  if (selectedKey !== null) {
    rules.push(
      `.stroke-list [data-hl-key="${selectedKey}"]{background:var(--highlight-selected-bg);box-shadow:inset 2px 0 0 var(--highlight-selected-bar)}`,
      `.stroke-list [data-hl-key="${selectedKey}"].stroke-list-item-pending{opacity:0.75}`,
    )
  }
  // FR-43: プレビュー上でのホバーは、リスト内マウス由来の:hoverと同じ見た目にする
  if (previewHoverKey !== null) {
    rules.push(
      `.stroke-list [data-hl-key="${previewHoverKey}"]{background:var(--highlight-hover-bg);box-shadow:inset 2px 0 0 var(--highlight-hover-bar)}`,
      `.stroke-list [data-hl-key="${previewHoverKey}"].stroke-list-item-pending{opacity:0.75}`,
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
  previewHoverKey,
  onHover,
  onSelect,
}: StrokeListPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH)
  const widthRef = useRef(width)
  widthRef.current = width
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

  // パネル幅のドラッグリサイズ。このパネルは右端にあるため、左端ハンドルを左へ
  // ドラッグするほど幅が広がる(startX - clientXの符号に注意)
  const handleResizeStart = useCallback((e: ReactMouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = widthRef.current
    const handleMouseMove = (moveEvent: MouseEvent): void => {
      const next = startWidth + (startX - moveEvent.clientX)
      setWidth(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, next)))
    }
    const handleMouseUp = (): void => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [])

  const rowRules = buildRowRules(
    selectedKey,
    previewHoverKey,
    contextMenu?.target.key ?? null,
  )

  return (
    <section
      className={`panel panel-stroke-list${isOpen ? '' : ' panel-collapsed'}`}
      style={isOpen ? { flex: `0 0 ${width}px` } : undefined}
    >
      {rowRules !== '' && <style>{rowRules}</style>}
      {isOpen && (
        <div className="panel-resize-handle" onMouseDown={handleResizeStart} />
      )}
      <div className="panel-header">
        <button type="button" onClick={() => setIsOpen((v) => !v)}>
          {isOpen ? '»' : '«'}
        </button>
        {isOpen && <h2>ストローク</h2>}
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
