import type { Point } from '../geometry/types'
import type { FillBlock } from '../fill/types'
import type { ParsedStroke } from '../svg/types'
import { materializeBlock } from './strokeJoin'
import type {
  DrawUnit,
  JoinedBlock,
  MaterializedDrawUnit,
  SequenceOrder,
} from './types'

/** FR-14の結合ブロックとFR-22の塗りブロックを、書き順並び替え(FR-15)の対象として1列に統合する */
export function toDrawUnits(
  blocks: JoinedBlock[],
  fillBlocks: FillBlock[],
): DrawUnit[] {
  return [
    ...blocks.map((block): DrawUnit => ({ kind: 'joinedStroke', block })),
    ...fillBlocks.map((fillBlock): DrawUnit => ({ kind: 'fill', fillBlock })),
  ]
}

/** 塗りブロックの物理セグメント列(輪郭線→塗り線の生成順)。内部並び替えの添字はこの並びを指す */
function fillBlockSegments(fillBlock: FillBlock): Point[][] {
  return [...(fillBlock.outlineLoops ?? []), ...fillBlock.fillChains]
}

/**
 * 内部並び替え結果(FR-15の最適化で求めた塗りブロック内部の順序・向き)を適用する。
 * 幾何再計算でセグメント本数だけが変わった場合に古い結果が残りうるため、
 * 長さが食い違う並び替え結果は破棄して生成順に戻す(ユニット単位のresolveUnitOrderと同じ扱い)。
 */
function applyInnerOrder(segments: Point[][], inner: SequenceOrder): Point[][] {
  if (
    inner.order.length !== segments.length ||
    inner.reversed.length !== segments.length
  ) {
    return segments
  }
  return inner.order.map((segIndex, i) =>
    inner.reversed[i] ? [...segments[segIndex]].reverse() : segments[segIndex],
  )
}

function materializeFillBlock(
  fillBlock: FillBlock,
  overallReversed: boolean,
  innerOrder: SequenceOrder | null,
): MaterializedDrawUnit {
  // 内部並び替え結果は各セグメントの向きまで含んでいるため、ユニット全体の反転とは併用しない
  const gcodeSegments =
    innerOrder !== null
      ? applyInnerOrder(fillBlockSegments(fillBlock), innerOrder)
      : [
          ...(fillBlock.outlineLoops ?? []),
          ...(overallReversed
            ? [...fillBlock.fillChains]
                .reverse()
                .map((chain) => [...chain].reverse())
            : fillBlock.fillChains),
        ]
  return {
    kind: 'fill',
    color: fillBlock.color,
    sourceId: fillBlock.sourceId,
    fillBlock,
    gcodeSegments,
  }
}

export function materializeDrawUnit(
  unit: DrawUnit,
  strokes: ParsedStroke[],
  overallReversed: boolean,
  /** FR-22の塗りブロック内部の並び替え結果(FR-15の最適化時のみ与えられる) */
  innerOrder: SequenceOrder | null = null,
): MaterializedDrawUnit {
  if (unit.kind === 'fill') {
    return materializeFillBlock(unit.fillBlock, overallReversed, innerOrder)
  }
  const materialized = materializeBlock(unit.block, strokes, overallReversed)
  const first = materialized.strokes[0]
  return {
    kind: 'joinedStroke',
    color: first?.color ?? '#000000',
    sourceId: first?.sourceId,
    strokes: materialized.strokes,
    gcodeSegments: [materialized.points],
  }
}

/** FR-15の貪欲法(greedyOptimizeOrder)に渡す始点・終点。セグメントを持たないユニットは原点扱いにする */
export function travelEndpoints(m: MaterializedDrawUnit): {
  start: Point
  end: Point
} {
  const nonEmpty = m.gcodeSegments.filter((s) => s.length > 0)
  if (nonEmpty.length === 0) {
    return { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }
  }
  return { start: nonEmpty[0][0], end: nonEmpty.at(-1)!.at(-1)! }
}
