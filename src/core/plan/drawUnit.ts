import type { Point } from '../geometry/types'
import type { FillBlock } from '../fill/types'
import type { ParsedStroke } from '../svg/types'
import { materializeBlock } from './strokeJoin'
import type { DrawUnit, JoinedBlock, MaterializedDrawUnit } from './types'

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

function materializeFillBlock(
  fillBlock: FillBlock,
  overallReversed: boolean,
): MaterializedDrawUnit {
  const fillChains = overallReversed
    ? [...fillBlock.fillChains].reverse().map((chain) => [...chain].reverse())
    : fillBlock.fillChains
  const gcodeSegments = [...(fillBlock.outlineLoops ?? []), ...fillChains]
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
): MaterializedDrawUnit {
  if (unit.kind === 'fill') {
    return materializeFillBlock(unit.fillBlock, overallReversed)
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
