import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { joinOverrideKey } from '../core/pathOptimize'
import type { FillListEntry, ListEntry, StrokeListEntry } from '../types/svg'

interface StrokeListPanelProps {
  entries: ListEntry[]
  /** FR-23のステップ実行プレビューと連動させ、未描画の行を薄く表示する */
  step: number
  /** FR-14: 個別上書き(結合する/しない)の現在値 */
  joinOverrides: Map<string, boolean>
  onSetJoinOverride: (idA: string, idB: string, join: boolean) => void
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

/**
 * 隣接する2行の間に表示する結合状態トグル(FR-14の簡易な個別上書きUI)。stroke行同士のみに表示する。
 * ブロックが畳まれている場合は、ブロック境界(前ブロックの末尾ストロークと次ブロックの先頭ストローク)
 * の間に表示され、クリックでブロック同士の結合/分割ができる。
 * memo化し、step変更(=pendingの変化)では再レンダされないようにする
 */
const JoinToggle = memo(function JoinToggle({
  a,
  b,
  joinOverrides,
  onSetJoinOverride,
}: {
  a: StrokeListEntry
  b: StrokeListEntry
  joinOverrides: Map<string, boolean>
  onSetJoinOverride: (idA: string, idB: string, join: boolean) => void
}) {
  const joined = a.blockId === b.blockId
  const overridden = joinOverrides.has(joinOverrideKey(a.id, b.id))
  const label = joined
    ? overridden
      ? '🔗 結合(手動)'
      : '🔗 結合'
    : overridden
      ? '⋯ 未結合(手動)'
      : '⋯ 未結合'

  return (
    <li className="stroke-join-toggle-row">
      <button
        type="button"
        className={`stroke-join-toggle${joined ? ' stroke-join-toggle-joined' : ''}`}
        onClick={() => onSetJoinOverride(a.id, b.id, !joined)}
        title="クリックで結合する/しないを切り替え(FR-14の個別上書き)"
      >
        {label}
      </button>
    </li>
  )
})

/** ブロック行/塗りブロック行の開閉トグル。子を持たない行では同幅のスペーサーで桁を揃える */
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
      className={`stroke-list-item${pending ? ' stroke-list-item-pending' : ''}`}
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
 * FR-14の結合ブロックの行。既定では中身(個別ストローク)を畳んだ1行として表示し、
 * 展開時のみ子ストローク行とブロック内部の結合トグルを描画する
 */
const BlockRow = memo(function BlockRow({
  groupKey,
  entries,
  startIndex,
  drawnCount,
  expanded,
  onToggleExpanded,
  joinOverrides,
  onSetJoinOverride,
}: {
  groupKey: string
  entries: StrokeListEntry[]
  startIndex: number
  /** このブロック内で既に描画済みのストローク数(FR-23のステップ換算済み) */
  drawnCount: number
  expanded: boolean
  /** 親から安定した参照で受け取る(行ごとにクロージャを作るとmemoが効かなくなるため) */
  onToggleExpanded: (key: string) => void
  joinOverrides: Map<string, boolean>
  onSetJoinOverride: (idA: string, idB: string, join: boolean) => void
}) {
  const first = entries[0]
  const pending = drawnCount === 0
  const partial = drawnCount > 0 && drawnCount < entries.length
  return (
    <li className="stroke-list-block">
      <div
        className={`stroke-list-item stroke-list-item-block${pending ? ' stroke-list-item-pending' : ''}${partial ? ' stroke-list-item-partial' : ''}`}
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
          🔗 結合ブロック({entries.length}本)
          {first.sourceId ? ` — id="${first.sourceId}"` : ''}
        </span>
      </div>
      {expanded && (
        <ol className="stroke-list stroke-list-children">
          {entries.map((entry, i) => (
            <Fragment key={entry.id}>
              {i > 0 && (
                <JoinToggle
                  a={entries[i - 1]}
                  b={entry}
                  joinOverrides={joinOverrides}
                  onSetJoinOverride={onSetJoinOverride}
                />
              )}
              <StrokeRow
                entry={entry}
                index={startIndex + i}
                pending={i >= drawnCount}
              />
            </Fragment>
          ))}
        </ol>
      )}
    </li>
  )
})

/**
 * 塗りブロックを展開したときの子行(輪郭線・ハッチ線)。FR-22によりこれらは並び替え・
 * ステップの単位ではないため、通し番号(stroke-list-index)は持たず桁だけ揃える
 */
function FillChildRow({ color, label }: { color: string; label: string }) {
  return (
    <li className="stroke-list-item">
      <span className="stroke-list-toggle-spacer" />
      <span className="stroke-list-index" />
      <span className="stroke-list-swatch" style={{ backgroundColor: color }} />
      <span className="stroke-list-label">{label}</span>
    </li>
  )
}

/**
 * FR-22: 塗りブロックの行(FR-23のステップ上は常に1ブロック=1ステップ、個別ハッチ線は
 * 並び替え対象としない)。結合ブロックと同様、中身(輪郭線・ハッチ線)は既定で畳んでおく。memo化
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
        className={`stroke-list-item stroke-list-item-fill${pending ? ' stroke-list-item-pending' : ''}`}
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
          🖌 塗りブロック({entry.hatchLineCount}本,{' '}
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
            />
          ))}
          {Array.from({ length: entry.hatchLineCount }, (_, i) => (
            <FillChildRow
              key={`hatch-${i}`}
              color={entry.color}
              label={`ハッチ線 ${i + 1}`}
            />
          ))}
        </ol>
      )}
    </li>
  )
})

function StrokeListPanelImpl({
  entries,
  step,
  joinOverrides,
  onSetJoinOverride,
}: StrokeListPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [expandedKeys, setExpandedKeys] =
    useState<ReadonlySet<string>>(EMPTY_EXPANDED)

  // 並び替え・パス結合・塗り設定変更等でリスト構成が変わったら、既定の「畳まれた状態」に戻す
  useEffect(() => {
    setExpandedKeys((prev) => (prev.size === 0 ? prev : EMPTY_EXPANDED))
  }, [entries])

  const handleToggleExpanded = useCallback((key: string): void => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }, [])

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
    <section
      className={`panel panel-stroke-list${isOpen ? '' : ' panel-collapsed'}`}
    >
      <div className="panel-header">
        <button type="button" onClick={() => setIsOpen((v) => !v)}>
          {isOpen ? '»' : '«'}
        </button>
        {isOpen && <h2>ストローク並び順</h2>}
      </div>
      {isOpen && (
        <div className="panel-body">
          <ol className="stroke-list">
            {groups.map((group, gi) => {
              // 畳まれた状態でもブロック境界の結合トグルは操作できるようにする(FR-14)
              const prev = groups[gi - 1]
              const prevTail =
                prev?.kind === 'block' ? prev.entries.at(-1)! : null
              const head = group.kind === 'block' ? group.entries[0] : null
              return (
                <Fragment key={group.key}>
                  {prevTail && head && (
                    <JoinToggle
                      a={prevTail}
                      b={head}
                      joinOverrides={joinOverrides}
                      onSetJoinOverride={onSetJoinOverride}
                    />
                  )}
                  {group.kind === 'fill' ? (
                    <FillRow
                      entry={group.entry}
                      index={group.index}
                      pending={group.index >= step}
                      expanded={expandedKeys.has(group.key)}
                      onToggleExpanded={handleToggleExpanded}
                    />
                  ) : group.entries.length === 1 ? (
                    <StrokeRow
                      entry={group.entries[0]}
                      index={group.startIndex}
                      pending={group.startIndex >= step}
                    />
                  ) : (
                    <BlockRow
                      groupKey={group.key}
                      entries={group.entries}
                      startIndex={group.startIndex}
                      drawnCount={Math.max(
                        0,
                        Math.min(step - group.startIndex, group.entries.length),
                      )}
                      expanded={expandedKeys.has(group.key)}
                      onToggleExpanded={handleToggleExpanded}
                      joinOverrides={joinOverrides}
                      onSetJoinOverride={onSetJoinOverride}
                    />
                  )}
                </Fragment>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}

export const StrokeListPanel = memo(StrokeListPanelImpl)
