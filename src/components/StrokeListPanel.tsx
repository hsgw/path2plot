import { Fragment, useState } from 'react'
import { joinOverrideKey } from '../core/pathOptimize'
import type { OrderedStroke } from '../types/svg'

interface StrokeListPanelProps {
  strokes: OrderedStroke[]
  /** FR-23のステップ実行プレビューと連動させ、未描画のストロークを薄く表示する */
  step: number
  /** FR-14: 個別上書き(結合する/しない)の現在値 */
  joinOverrides: Map<string, boolean>
  onSetJoinOverride: (idA: string, idB: string, join: boolean) => void
  /** FR-15: 貪欲法による並び替えを実行する */
  onOptimize: () => void
  /** 上書き・最適化結果をクリアし、出現順+自動結合のみの状態に戻す */
  onResetOrder: () => void
}

/** 隣接する2行の間に表示する結合状態トグル(FR-14の簡易な個別上書きUI) */
function JoinToggle({
  a,
  b,
  joinOverrides,
  onSetJoinOverride,
}: {
  a: OrderedStroke
  b: OrderedStroke
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
}

export function StrokeListPanel({
  strokes,
  step,
  joinOverrides,
  onSetJoinOverride,
  onOptimize,
  onResetOrder,
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
        {isOpen && (
          <div className="stroke-list-order-controls">
            <button
              type="button"
              onClick={onOptimize}
              disabled={strokes.length === 0}
            >
              最適化
            </button>
            <button type="button" onClick={onResetOrder}>
              順序をリセット
            </button>
          </div>
        )}
      </div>
      {isOpen && (
        <div className="panel-body">
          <ol className="stroke-list">
            {strokes.map((stroke, i) => {
              const prev = strokes[i - 1]
              const sameBlockAsPrev = prev && prev.blockId === stroke.blockId
              return (
                <Fragment key={stroke.id}>
                  {prev && (
                    <JoinToggle
                      a={prev}
                      b={stroke}
                      joinOverrides={joinOverrides}
                      onSetJoinOverride={onSetJoinOverride}
                    />
                  )}
                  <li
                    className={`stroke-list-item${i >= step ? ' stroke-list-item-pending' : ''}${sameBlockAsPrev ? ' stroke-list-item-joined' : ''}`}
                  >
                    <span className="stroke-list-index">{i + 1}</span>
                    <span
                      className="stroke-list-swatch"
                      style={{ backgroundColor: stroke.color }}
                    />
                    <span className="stroke-list-label">
                      {stroke.sourceId ?? stroke.id}
                    </span>
                  </li>
                </Fragment>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
