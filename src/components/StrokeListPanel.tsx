import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { joinOverrideKey } from '../core/pathOptimize'
import type {
  FillListEntry,
  HighlightSelection,
  ListEntry,
  StrokeListEntry,
} from '../types/svg'

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

/**
 * FR-43のハイライト行キー。行の種別ごとに接頭辞を付け、同じidを持つ行
 * (block行とその先頭ストローク行など)が衝突しないようにする
 */
const strokeRowKey = (id: string): string => `stroke:${id}`
const blockRowKey = (id: string): string => `block:${id}`
const fillRowKey = (id: string): string => `fill:${id}`
const fillChildRowKey = (id: string, segmentOffset: number): string =>
  `fillchild:${id}:${segmentOffset}`

/**
 * FR-43: イベント委譲で、ホバー/クリック/右クリックされた位置から対象行のハイライト情報を読み取る。
 * 各行がdata-hl-*属性として持つ情報(プレビューのどのセグメントに対応するか)を復元する。
 * 行ごとにハンドラを持たせると、数万行のリストでクロージャ生成コストが無視できなくなるため、
 * リスト全体で1組のハンドラだけを使う
 */
function findHighlightTarget(
  target: EventTarget | null,
): HighlightSelection | null {
  if (!(target instanceof Element)) return null
  const row = target.closest<HTMLElement>('[data-hl-key]')
  if (!row) return null
  const { hlKey, hlIndex, hlCount, hlOffset } = row.dataset
  if (hlKey === undefined || hlIndex === undefined || hlCount === undefined) {
    return null
  }
  return {
    key: hlKey,
    entryIndex: Number(hlIndex),
    entryCount: Number(hlCount),
    segmentOffset: hlOffset === undefined ? undefined : Number(hlOffset),
  }
}

/**
 * FR-40の階層表示用に、フラットなListEntry列をブロック単位へまとめたもの。
 * blockは同一結合ブロックに属する連続したstroke行、fillは塗りブロック1つ。
 * 単独ストローク(結合されていないblock)はblockとして扱いつつ、行の見た目は個別ストロークのままとする
 */
type ListGroup =
  | {
      kind: 'block'
      key: string
      /** グループ先頭がListEntry全体の何番目か(FR-23のステップ換算に使う) */
      startIndex: number
      entries: StrokeListEntry[]
    }
  | { kind: 'fill'; key: string; index: number; entry: FillListEntry }

// 参照を使い回し、展開状態リセット時に不要な再レンダを起こさないようにする
const EMPTY_EXPANDED: ReadonlySet<string> = new Set()

/** 右クリックメニューの表示状態。targetはFR-43のハイライトと同じ行識別情報 */
interface ContextMenuState {
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

/** FR-14: 結合/未結合の切り替えを行う右クリックメニュー(旧・行間の結合トグルの置き換え) */
function StrokeContextMenu({
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

/** block行/fill行の開閉トグル。子を持たない行では同幅のスペーサーで桁を揃える */
function ExpandToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="stroke-list-toggle"
      aria-expanded={expanded}
      onClick={onToggle}
      title={expanded ? '中身を畳む' : '中身を展開'}
    >
      {expanded ? '▼' : '▶'}
    </button>
  )
}

/**
 * 個別ストロークの行。memo化することで、ステップ操作時に実際にpending(未描画/描画済み)が
 * 変化した行だけが再レンダされ、リスト全体(最大数万行)の再構築を避ける
 */
const StrokeRow = memo(function StrokeRow({
  entry,
  index,
  pending,
}: {
  entry: StrokeListEntry
  index: number
  pending: boolean
}) {
  return (
    <li
      className={`stroke-list-item stroke-list-item-clickable${pending ? ' stroke-list-item-pending' : ''}`}
      // FR-43: 個別ストロークは常にListEntry1件=プレビューの1セグメントに対応する
      data-hl-key={strokeRowKey(entry.id)}
      data-hl-index={index}
      data-hl-count={1}
    >
      <span className="stroke-list-toggle-spacer" />
      <span className="stroke-list-index">{index + 1}</span>
      <span
        className="stroke-list-swatch"
        style={{ backgroundColor: entry.color }}
      />
      <span className="stroke-list-label">{entry.sourceId ?? entry.id}</span>
    </li>
  )
})

/**
 * FR-14の結合ブロック(リスト上の表記はblock)の行。既定では中身(個別ストローク)を畳んだ
 * 1行として表示し、展開時のみ子ストローク行を描画する
 */
const BlockRow = memo(function BlockRow({
  groupKey,
  entries,
  startIndex,
  drawnCount,
  expanded,
  onToggleExpanded,
}: {
  groupKey: string
  entries: StrokeListEntry[]
  startIndex: number
  /** このブロック内で既に描画済みのストローク数(FR-23のステップ換算済み) */
  drawnCount: number
  expanded: boolean
  /** 親から安定した参照で受け取る(行ごとにクロージャを作るとmemoが効かなくなるため) */
  onToggleExpanded: (key: string) => void
}) {
  const first = entries[0]
  const pending = drawnCount === 0
  const partial = drawnCount > 0 && drawnCount < entries.length
  return (
    <li className="stroke-list-block">
      <div
        className={`stroke-list-item stroke-list-item-block stroke-list-item-clickable${pending ? ' stroke-list-item-pending' : ''}${partial ? ' stroke-list-item-partial' : ''}`}
        // FR-43: block行のハイライトはブロック内の全ストロークが対象
        data-hl-key={blockRowKey(groupKey)}
        data-hl-index={startIndex}
        data-hl-count={entries.length}
      >
        <ExpandToggle
          expanded={expanded}
          onToggle={() => onToggleExpanded(groupKey)}
        />
        <span className="stroke-list-index">{startIndex + 1}</span>
        <span
          className="stroke-list-swatch"
          style={{ backgroundColor: first.color }}
        />
        <span className="stroke-list-label">
          🔗 block({entries.length}本)
          {first.sourceId ? ` — id="${first.sourceId}"` : ''}
        </span>
      </div>
      {expanded && (
        <ol className="stroke-list stroke-list-children">
          {entries.map((entry, i) => (
            <StrokeRow
              key={entry.id}
              entry={entry}
              index={startIndex + i}
              pending={i >= drawnCount}
            />
          ))}
        </ol>
      )}
    </li>
  )
})

/**
 * fill行を展開したときの子行(輪郭線・ハッチ線)。FR-22によりこれらは並び替え・
 * ステップの単位ではないため、通し番号(stroke-list-index)は持たず桁だけ揃える
 */
function FillChildRow({
  color,
  label,
  entryId,
  entryIndex,
  segmentOffset,
}: {
  color: string
  label: string
  entryId: string
  entryIndex: number
  /** fill内での物理セグメント番号(輪郭線→ハッチ線の並び順、drawUnitのgcodeSegmentsと同順) */
  segmentOffset: number
}) {
  return (
    <li
      className="stroke-list-item stroke-list-item-clickable"
      data-hl-key={fillChildRowKey(entryId, segmentOffset)}
      data-hl-index={entryIndex}
      data-hl-count={1}
      data-hl-offset={segmentOffset}
    >
      <span className="stroke-list-toggle-spacer" />
      <span className="stroke-list-index" />
      <span className="stroke-list-swatch" style={{ backgroundColor: color }} />
      <span className="stroke-list-label">{label}</span>
    </li>
  )
}

/**
 * FR-22: 塗りブロック(リスト上の表記はfill)の行。FR-23のステップ上は常に1ブロック=1ステップで、
 * 個別ハッチ線は並び替え対象としない。blockと同様、中身(輪郭線・ハッチ線)は既定で畳んでおく。memo化
 */
const FillRow = memo(function FillRow({
  entry,
  index,
  pending,
  expanded,
  onToggleExpanded,
}: {
  entry: FillListEntry
  index: number
  pending: boolean
  expanded: boolean
  /** BlockRowと同様、安定した参照を受け取りキー(entry.id)を渡し返す */
  onToggleExpanded: (key: string) => void
}) {
  const childCount = entry.outlineLoopCount + entry.hatchLineCount
  return (
    <li className="stroke-list-block">
      <div
        className={`stroke-list-item stroke-list-item-fill stroke-list-item-clickable${pending ? ' stroke-list-item-pending' : ''}`}
        // FR-43: fill行のハイライトは輪郭線・ハッチ線を含むブロック全体が対象
        data-hl-key={fillRowKey(entry.id)}
        data-hl-index={index}
        data-hl-count={1}
      >
        {childCount > 0 ? (
          <ExpandToggle
            expanded={expanded}
            onToggle={() => onToggleExpanded(entry.id)}
          />
        ) : (
          <span className="stroke-list-toggle-spacer" />
        )}
        <span className="stroke-list-index">{index + 1}</span>
        <span
          className="stroke-list-swatch"
          style={{ backgroundColor: entry.color }}
        />
        <span className="stroke-list-label">
          🖌 fill({entry.hatchLineCount}本,{' '}
          {entry.outlineLoopCount > 0 ? '輪郭あり' : '輪郭なし'})
          {entry.sourceId ? ` — id="${entry.sourceId}"` : ''}
        </span>
        {entry.error && (
          <span className="stroke-list-fill-error" title={entry.error.message}>
            ⚠ 形状破綻
          </span>
        )}
      </div>
      {expanded && childCount > 0 && (
        <ol className="stroke-list stroke-list-children">
          {Array.from({ length: entry.outlineLoopCount }, (_, i) => (
            <FillChildRow
              key={`outline-${i}`}
              color={entry.color}
              label={`輪郭線 ${i + 1}`}
              entryId={entry.id}
              entryIndex={index}
              segmentOffset={i}
            />
          ))}
          {Array.from({ length: entry.hatchLineCount }, (_, i) => (
            <FillChildRow
              key={`hatch-${i}`}
              color={entry.color}
              label={`ハッチ線 ${i + 1}`}
              entryId={entry.id}
              entryIndex={index}
              // ハッチ線は輪郭線の後に描画されるため、セグメント番号は輪郭線の本数だけずれる
              segmentOffset={entry.outlineLoopCount + i}
            />
          ))}
        </ol>
      )}
    </li>
  )
})

/**
 * リスト行ツリー本体。FR-43のハイライト状態や右クリックメニューの状態をpropsに含めないことで、
 * ホバー/選択/メニュー開閉が変わってもmemoが効いて再レンダされない(city.svgのような数千ストロークの
 * ファイルでは、この再レンダだけで1操作あたり100〜350msかかっていた)。ホバー中の行の見た目はCSSの
 * :hoverが、選択中・メニュー対象の行の見た目はStrokeListPanelImplが差し込む属性セレクタのルールが担当する
 */
const StrokeListRows = memo(function StrokeListRows({
  entries,
  step,
  expandedKeys,
  onToggleExpanded,
  onHover,
  onSelect,
  onContextMenu,
}: {
  entries: ListEntry[]
  step: number
  expandedKeys: ReadonlySet<string>
  onToggleExpanded: (key: string) => void
  onHover: (selection: HighlightSelection | null) => void
  onSelect: (selection: HighlightSelection) => void
  onContextMenu: (
    target: HighlightSelection,
    clientX: number,
    clientY: number,
  ) => void
}) {
  const groups = useMemo(() => {
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
  }, [entries])

  return (
    <ol
      className="stroke-list"
      onMouseOver={(e) => onHover(findHighlightTarget(e.target))}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => {
        // 開閉ボタンの操作は行の選択として扱わない
        if (
          e.target instanceof Element &&
          e.target.closest('.stroke-list-toggle')
        ) {
          return
        }
        const target = findHighlightTarget(e.target)
        if (target) onSelect(target)
      }}
      onContextMenu={(e) => {
        const target = findHighlightTarget(e.target)
        // 行の外(リストの余白)ではブラウザ標準のメニューをそのまま出す
        if (!target) return
        e.preventDefault()
        onContextMenu(target, e.clientX, e.clientY)
      }}
    >
      {groups.map((group) =>
        group.kind === 'fill' ? (
          <FillRow
            key={group.key}
            entry={group.entry}
            index={group.index}
            pending={group.index >= step}
            expanded={expandedKeys.has(group.key)}
            onToggleExpanded={onToggleExpanded}
          />
        ) : group.entries.length === 1 ? (
          <StrokeRow
            key={group.key}
            entry={group.entries[0]}
            index={group.startIndex}
            pending={group.startIndex >= step}
          />
        ) : (
          <BlockRow
            key={group.key}
            groupKey={group.key}
            entries={group.entries}
            startIndex={group.startIndex}
            drawnCount={Math.max(
              0,
              Math.min(step - group.startIndex, group.entries.length),
            )}
            expanded={expandedKeys.has(group.key)}
            onToggleExpanded={onToggleExpanded}
          />
        ),
      )}
    </ol>
  )
})

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

  // FR-43: 選択中の行のスタイル。className経由で付けるとリスト全体の再レンダが必要になるため、
  // 対象行だけにマッチするルールを差し込む(色の定義はApp.css側の変数)。
  // 右クリックメニューの対象行も同じ方式で枠線を付け、どの行への操作かを分かるようにする
  const rowRules =
    (selectedKey === null
      ? ''
      : `.stroke-list [data-hl-key="${selectedKey}"]{background:var(--highlight-selected-bg);box-shadow:inset 2px 0 0 var(--highlight-selected-bar)}` +
        `.stroke-list [data-hl-key="${selectedKey}"].stroke-list-item-pending{opacity:0.75}`) +
    (contextMenu === null
      ? ''
      : `.stroke-list [data-hl-key="${contextMenu.target.key}"]{outline:1px dashed var(--highlight-selected-bar);outline-offset:-1px;opacity:1}`)

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
