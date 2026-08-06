import { memo, useMemo } from 'react'
import {
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  LinkIcon,
} from '../common/icons'
import { groupEntries } from '../../core/plan/highlight'
import type {
  FillListEntry,
  HighlightSelection,
  ListEntry,
  StrokeListEntry,
} from '../../core/plan/types'
import {
  blockRowKey,
  fillChildRowKey,
  fillRowKey,
  findHighlightTarget,
  strokeRowKey,
} from './rowKeys'

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
      {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
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
          <LinkIcon /> block({entries.length}本)
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
 * fill行を展開したときにリスト上部に表示する、畳んだ状態では省略されるパラメータ
 * (パターン・輪郭有無・元のid)の内訳行
 */
function FillParamsRow({ entry }: { entry: FillListEntry }) {
  return (
    <li className="stroke-list-item stroke-list-params">
      <span className="stroke-list-toggle-spacer" />
      <span className="stroke-list-index" />
      <span className="stroke-list-swatch-spacer" />
      <span className="stroke-list-label">
        {entry.patternLabel} ・{' '}
        {entry.outlineLoopCount > 0 ? '輪郭あり' : '輪郭なし'}
        {entry.sourceId ? ` ・ id="${entry.sourceId}"` : ''}
      </span>
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
  const childCount = entry.outlineLoopCount + entry.fillChainCount
  return (
    <li className="stroke-list-block">
      <div
        className={`stroke-list-item stroke-list-item-fill stroke-list-item-clickable${pending ? ' stroke-list-item-pending' : ''}${entry.overridden ? ' stroke-list-item-overridden' : ''}`}
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
          fill({entry.patternLabel}・{entry.fillChainCount}本)
        </span>
        {entry.overridden && (
          <button
            type="button"
            className="stroke-list-fill-reset"
            data-fill-reset-id={entry.id}
            title="個別設定を元に戻す(グローバル設定を使う)"
          >
            <ArrowUturnLeftIcon />
          </button>
        )}
        {entry.error && (
          <span className="stroke-list-fill-error" title={entry.error.message}>
            <ExclamationTriangleIcon />
          </span>
        )}
      </div>
      {expanded && childCount > 0 && (
        <ol className="stroke-list stroke-list-children">
          <FillParamsRow entry={entry} />
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
          {Array.from({ length: entry.fillChainCount }, (_, i) => (
            <FillChildRow
              key={`fill-${i}`}
              color={entry.color}
              label={`塗り線 ${i + 1}`}
              entryId={entry.id}
              entryIndex={index}
              // 塗り線は輪郭線の後に描画されるため、セグメント番号は輪郭線の本数だけずれる
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
 * :hoverが、選択中・メニュー対象の行の見た目はStrokeListPanelが差し込む属性セレクタのルールが担当する
 */
export const StrokeListRows = memo(function StrokeListRows({
  entries,
  step,
  expandedKeys,
  onToggleExpanded,
  onHover,
  onSelect,
  onContextMenu,
  onResetFillOverride,
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
  onResetFillOverride: (fillId: string) => void
}) {
  const groups = useMemo(() => groupEntries(entries), [entries])

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
        // 「元に戻す」アイコンの操作は行の選択にせず、個別上書きの解除として扱う
        if (e.target instanceof Element) {
          const resetButton = e.target.closest<HTMLElement>(
            '[data-fill-reset-id]',
          )
          if (resetButton) {
            onResetFillOverride(resetButton.dataset.fillResetId!)
            return
          }
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
