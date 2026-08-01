import { memo, useCallback, useEffect, useState } from 'react'
import type { HighlightSelection, ListEntry } from '../../core/plan/types'
import { StrokeContextMenu, type ContextMenuState } from './StrokeContextMenu'
import { StrokeListRows } from './StrokeListRows'

interface StrokeListPanelProps {
  entries: ListEntry[]
  /** FR-23のステップ実行プレビューと連動させ、未描画の行を薄く表示する */
  step: number
  /** FR-14: 個別上書き(結合する/しない)の現在値。右クリックメニューの表示・操作に使う */
  joinOverrides: Map<string, boolean>
  onSetJoinOverride: (idA: string, idB: string, join: boolean) => void
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
  selectedKey,
  onHover,
  onSelect,
}: StrokeListPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [expandedKeys, setExpandedKeys] =
    useState<ReadonlySet<string>>(EMPTY_EXPANDED)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // 並び替え・パス結合・塗り設定変更等でリスト構成が変わったら、既定の「畳まれた状態」に戻し、
  // 行の対応が取れなくなった右クリックメニューも閉じる
  useEffect(() => {
    setExpandedKeys((prev) => (prev.size === 0 ? prev : EMPTY_EXPANDED))
    setContextMenu(null)
  }, [entries])

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
          />
          {contextMenu !== null && (
            <StrokeContextMenu
              state={contextMenu}
              entries={entries}
              joinOverrides={joinOverrides}
              onSetJoinOverride={onSetJoinOverride}
              onClose={handleCloseContextMenu}
            />
          )}
        </div>
      )}
    </section>
  )
}

export const StrokeListPanel = memo(StrokeListPanelImpl)
