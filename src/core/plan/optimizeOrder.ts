import type { FillBlock } from '../fill/types'
import type { Point } from '../geometry/types'
import type { ParsedStroke } from '../svg/types'
import { materializeDrawUnit, travelEndpoints } from './drawUnit'
import {
  exitPointOf,
  greedyOptimizeOrder,
  pickNearest,
  type Endpoints,
} from './travelOrder'
import type { DrawUnit, SequenceOrder, UnitOrder } from './types'

/** 点列の始点・終点。空のセグメントはペン位置を動かさない扱いにして添字だけ保つ */
function segmentEndpoints(points: Point[], current: Point): Endpoints {
  if (points.length === 0) return { start: current, end: current }
  return { start: points[0], end: points.at(-1)! }
}

/**
 * 塗りブロックへ到達した位置(entry)を起点に、ブロック内部のセグメント順序・向きを最適化する。
 * 添字はfillBlockSegments(輪郭線→塗り線の生成順)に対応する。
 *
 * 輪郭線グループ→塗り線グループという大枠の順序は保ち、各グループ内だけを並び替える。
 * 輪郭線を先に描く既存の挙動を変えないため、またリスト表示の子行(輪郭線 n/塗り線 n)が
 * 「塗り線の物理セグメント番号は輪郭線の本数だけずれる」前提で番号を振っているため。
 */
function optimizeFillInner(
  fillBlock: FillBlock,
  entry: Point,
): { inner: SequenceOrder; exit: Point } {
  const groups = [fillBlock.outlineLoops ?? [], fillBlock.fillChains]
  const order: number[] = []
  const reversed: boolean[] = []
  let current = entry
  let offset = 0

  for (const segments of groups) {
    const endpoints = segments.map((s) => segmentEndpoints(s, current))
    const result = greedyOptimizeOrder(endpoints, current)
    result.order.forEach((segIndex, i) => {
      order.push(offset + segIndex)
      reversed.push(result.reversed[i])
    })
    current = exitPointOf(endpoints, result, current)
    offset += segments.length
  }

  return { inner: { order, reversed }, exit: current }
}

/**
 * FR-15: ペンアップ移動距離の最小化を目的とした書き順・方向の自動最適化。
 *
 * ユニット(FR-14の結合ブロック/FR-22の塗りブロック)単位の貪欲最近傍法に加え、
 * 塗りブロックについてはブロックへ到達した位置を起点に、ブロック内部のセグメント順序・向きも
 * 最適化する(内部を生成順のまま描くと、直前のユニットから遠い側の端から描き始めたり、
 * 輪郭線と塗り線の間を無駄に往復したりするため)。
 *
 * 次に描くユニットの選択自体は、従来どおりユニットの生成順での始点・終点だけで判断する
 * (塗りブロックの全セグメントの端点を候補にすると、選択がO(ユニット数×セグメント総数)になるため)。
 * 内部最適化で実際の入口・出口は変わりうるが、次のユニットを選ぶ際の現在地には最適化後の
 * 実際の出口を使うので、ブロックをまたぐ移動距離の評価はずれない。
 */
export function optimizeDrawOrder(
  units: DrawUnit[],
  strokes: ParsedStroke[],
  start: Point,
): UnitOrder {
  const endpoints = units.map((unit) =>
    travelEndpoints(materializeDrawUnit(unit, strokes, false)),
  )
  const remaining = units.map((_, i) => i)
  const order: number[] = []
  const reversed: boolean[] = []
  const innerOrders: (SequenceOrder | null)[] = []
  let current = start

  while (remaining.length > 0) {
    const picked = pickNearest(endpoints, remaining, current)
    const unitIndex = remaining[picked.pos]
    remaining.splice(picked.pos, 1)
    order.push(unitIndex)

    const unit = units[unitIndex]
    if (unit.kind === 'fill') {
      const { inner, exit } = optimizeFillInner(unit.fillBlock, current)
      // 向きは内部並び替え側が持つため、ユニット全体の反転フラグは使わない
      reversed.push(false)
      innerOrders.push(inner)
      current = exit
      continue
    }

    reversed.push(picked.reversed)
    innerOrders.push(null)
    current = picked.reversed
      ? endpoints[unitIndex].start
      : endpoints[unitIndex].end
  }

  return { order, reversed, innerOrders }
}
