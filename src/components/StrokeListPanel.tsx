import { Fragment, memo, useState } from 'react'
import { joinOverrideKey } from '../core/pathOptimize'
import type { ListEntry, StrokeListEntry } from '../types/svg'

interface StrokeListPanelProps {
  entries: ListEntry[]
  /** FR-23のステップ実行プレビューと連動させ、未描画の行を薄く表示する */
  step: number
  /** FR-14: 個別上書き(結合する/しない)の現在値 */
  joinOverrides: Map<string, boolean>
  onSetJoinOverride: (idA: string, idB: string, join: boolean) => void
}

/**
 * 隣接する2行の間に表示する結合状態トグル(FR-14の簡易な個別上書きUI)。stroke行同士のみに表示する。
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

/** FR-22: 塗りブロックの行(常にブロック単位で1行のみ、個別ハッチ線は並び替え対象としない)。memo化 */
const FillRow = memo(function FillRow({
  entry,
  pending,
}: {
  entry: Extract<ListEntry, { kind: 'fill' }>
  pending: boolean
}) {
  const outlineLabel = entry.hasOutline ? '輪郭あり' : '輪郭なし'
  return (
    <li
      className={`stroke-list-item stroke-list-item-fill${pending ? ' stroke-list-item-pending' : ''}`}
    >
      <span
        className="stroke-list-swatch"
        style={{ backgroundColor: entry.color }}
      />
      <span className="stroke-list-label">
        🖌 塗りブロック({entry.hatchLineCount}本, {outlineLabel})
        {entry.sourceId ? ` — id="${entry.sourceId}"` : ''}
      </span>
      {entry.error && (
        <span className="stroke-list-fill-error" title={entry.error.message}>
          ⚠ 形状破綻
        </span>
      )}
    </li>
  )
})

/**
 * 個別ストロークの行。memo化することで、ステップ操作時に実際にpending(未描画/描画済み)が
 * 変化した行だけが再レンダされ、リスト全体(最大数万行)の再構築を避ける
 */
const StrokeRow = memo(function StrokeRow({
  entry,
  index,
  pending,
  joined,
}: {
  entry: StrokeListEntry
  index: number
  pending: boolean
  joined: boolean
}) {
  return (
    <li
      className={`stroke-list-item${pending ? ' stroke-list-item-pending' : ''}${joined ? ' stroke-list-item-joined' : ''}`}
    >
      <span className="stroke-list-index">{index + 1}</span>
      <span
        className="stroke-list-swatch"
        style={{ backgroundColor: entry.color }}
      />
      <span className="stroke-list-label">{entry.sourceId ?? entry.id}</span>
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
            {entries.map((entry, i) => {
              const prev = entries[i - 1]
              const sameBlockAsPrev =
                prev && prev.kind === 'stroke' && entry.kind === 'stroke'
                  ? prev.blockId === entry.blockId
                  : false
              return (
                <Fragment key={entry.id}>
                  {prev &&
                    prev.kind === 'stroke' &&
                    entry.kind === 'stroke' && (
                      <JoinToggle
                        a={prev}
                        b={entry}
                        joinOverrides={joinOverrides}
                        onSetJoinOverride={onSetJoinOverride}
                      />
                    )}
                  {entry.kind === 'fill' ? (
                    <FillRow entry={entry} pending={i >= step} />
                  ) : (
                    <StrokeRow
                      entry={entry}
                      index={i}
                      pending={i >= step}
                      joined={sameBlockAsPrev}
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
