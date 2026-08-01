import { useEffect, useLayoutEffect, useRef } from 'react'
import type {
  HighlightSelection,
  ListEntry,
  StrokeListEntry,
} from '../../core/plan/types'
import { joinOverrideKey } from '../../core/plan/strokeJoin'

/** 右クリックメニューの表示状態。targetはFR-43のハイライトと同じ行識別情報 */
export interface ContextMenuState {
  /** メニューを開いた位置(clientX/clientY) */
  x: number
  y: number
  target: HighlightSelection
}

/** メニュー内の結合操作1つ分(対象行の前側/後側それぞれについて算出する) */
interface JoinAction {
  a: StrokeListEntry
  b: StrokeListEntry
  /** 現在この2本が同じblockに属しているか */
  joined: boolean
  /** FR-14の個別上書きが設定済みか(自動判定のままではないか) */
  overridden: boolean
}

/**
 * entries[index]とentries[index+1]がどちらもストローク行のときだけ、その隣接ペアに対する
 * 結合操作を組み立てる(fillは結合の対象外)。
 * 畳まれたblock行(entryCount>1)を対象にした場合も、この関数に渡すindexを選ぶことで
 * ブロック境界のペア(前ブロックの末尾ストロークと次ブロックの先頭ストローク)になる
 */
function joinActionAt(
  entries: ListEntry[],
  index: number,
  joinOverrides: Map<string, boolean>,
): JoinAction | null {
  const a = entries[index]
  const b = entries[index + 1]
  if (a === undefined || b === undefined) return null
  if (a.kind !== 'stroke' || b.kind !== 'stroke') return null
  return {
    a,
    b,
    joined: a.blockId === b.blockId,
    overridden: joinOverrides.has(joinOverrideKey(a.id, b.id)),
  }
}

/** メニュー見出しに出す、操作対象の行の説明 */
function describeRow(entries: ListEntry[], target: HighlightSelection): string {
  const entry = entries[target.entryIndex]
  if (entry === undefined) return ''
  const no = `${target.entryIndex + 1}. `
  if (entry.kind === 'fill') return `${no}fill`
  if (target.entryCount > 1) return `${no}block(${target.entryCount}本)`
  return `${no}${entry.sourceId ?? entry.id}`
}

/** 結合/未結合を切り替えるメニュー項目。隣接ストロークがない場合は無効化して理由を示す */
function JoinMenuItem({
  action,
  position,
  onSetJoinOverride,
  onClose,
}: {
  action: JoinAction | null
  /** 対象行から見てどちら側の隣接ペアか */
  position: '前' | '次'
  onSetJoinOverride: (idA: string, idB: string, join: boolean) => void
  onClose: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="stroke-context-menu-item"
      disabled={action === null}
      title={
        action === null
          ? `${position}に結合できるストロークがありません(リストの端、またはfillが隣接している)`
          : 'FR-14: 端点結合の個別上書き'
      }
      onClick={() => {
        if (action === null) return
        onSetJoinOverride(action.a.id, action.b.id, !action.joined)
        onClose()
      }}
    >
      <span>
        {action?.joined
          ? `${position}の行との結合を解除`
          : `${position}の行と結合`}
      </span>
      {action?.overridden && (
        <span className="stroke-context-menu-note">手動</span>
      )}
    </button>
  )
}

/** FR-14: 結合/未結合の切り替えを行う右クリックメニュー */
export function StrokeContextMenu({
  state,
  entries,
  joinOverrides,
  onSetJoinOverride,
  onClose,
}: {
  state: ContextMenuState
  entries: ListEntry[]
  joinOverrides: Map<string, boolean>
  onSetJoinOverride: (idA: string, idB: string, join: boolean) => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const { target } = state
  const prevAction = joinActionAt(entries, target.entryIndex - 1, joinOverrides)
  const nextAction = joinActionAt(
    entries,
    target.entryIndex + target.entryCount - 1,
    joinOverrides,
  )

  // 画面外へはみ出さないよう、実寸を測ってから位置を確定する(ペイント前に確定させたいのでlayout effect)
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const x = Math.max(4, Math.min(state.x, window.innerWidth - width - 4))
    const y = Math.max(4, Math.min(state.y, window.innerHeight - height - 4))
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [state])

  // メニュー外のクリック・スクロール・リサイズ・Escapeで閉じる。メニューを開いた右クリックの
  // pointerdownはcontextmenuより前に発火済みのため、この購読で即座に閉じてしまうことはない
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent): void => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target))
        return
      onClose()
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', onClose)
    // リストをスクロールしたときにメニューだけ取り残されないよう、子要素のスクロールもcaptureで拾う
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="stroke-context-menu"
      role="menu"
      style={{ left: state.x, top: state.y }}
    >
      <div className="stroke-context-menu-header">
        {describeRow(entries, target)}
      </div>
      <JoinMenuItem
        action={prevAction}
        position="前"
        onSetJoinOverride={onSetJoinOverride}
        onClose={onClose}
      />
      <JoinMenuItem
        action={nextAction}
        position="次"
        onSetJoinOverride={onSetJoinOverride}
        onClose={onClose}
      />
    </div>
  )
}
