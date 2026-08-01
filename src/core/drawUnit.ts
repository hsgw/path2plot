import type { Point } from '../types/geometry'
import type { FillBlock } from '../types/fill'
import type { ParsedStroke } from '../types/svg'
import { type JoinedBlock, materializeBlock } from './pathOptimize'

/** 書き順並び替え(FR-15)の対象となる1ユニット。FR-14の結合ブロック、またはFR-22の塗りブロック */
export type DrawUnit =
  | { kind: 'joinedStroke'; block: JoinedBlock }
  | { kind: 'fill'; fillBlock: FillBlock }

export interface MaterializedDrawUnit {
  kind: 'joinedStroke' | 'fill'
  color: string
  sourceId?: string
  /** kind==='joinedStroke'の場合のみ。ブロックを構成する個別ストローク(リスト表示単位) */
  strokes?: ParsedStroke[]
  /** kind==='fill'の場合のみ。リスト表示用のサマリ情報(向き反転は反映されない) */
  fillBlock?: FillBlock
  /**
   * G-code出力・実際のペン上げ下げ単位(1配列要素=1回のペンダウン〜アップ、向き反転も反映済み)。
   * joinedStrokeなら常に長さ1。fillならoutlineLoops+fillChainsの本数(0の場合もある、FR-20エラー時)
   */
  gcodeSegments: Point[][]
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
