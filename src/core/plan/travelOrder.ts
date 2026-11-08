import type { Point } from '../geometry/types'
import { distance } from '../geometry/vector'
import type { SequenceOrder } from './types'

/** 並び替えの対象1件を、経路長の計算に必要な始点・終点だけで表したもの */
export interface Endpoints {
  start: Point
  end: Point
}

export const DEFAULT_ORDER_OPTIONS = { reorderPaths: true, reversePaths: true }
export type OrderOptions = typeof DEFAULT_ORDER_OPTIONS

export function shouldReverse(unit: Endpoints, current: Point): boolean {
  return distance(current, unit.end) < distance(current, unit.start)
}

/**
 * 未訪問(remaining)のうち現在地に最も近いものを1つ選ぶ。
 * posはremaining内の位置、reversedはend側から入る(逆向きに辿る)ことを表す。
 */
export function pickNearest(
  units: Endpoints[],
  remaining: number[],
  current: Point,
  allowReverse = true,
): { pos: number; reversed: boolean } {
  let bestPos = 0
  let bestReversed = false
  let bestDistance = Infinity

  for (let k = 0; k < remaining.length; k++) {
    const unit = units[remaining[k]]
    const dStart = distance(current, unit.start)
    const dEnd = allowReverse ? distance(current, unit.end) : Infinity
    if (dStart < bestDistance) {
      bestDistance = dStart
      bestPos = k
      bestReversed = false
    }
    if (dEnd < bestDistance) {
      bestDistance = dEnd
      bestPos = k
      bestReversed = true
    }
  }

  return { pos: bestPos, reversed: bestReversed }
}

/**
 * ペンアップ移動距離の最小化を目的とした貪欲法(最近傍逐次選択)による並び替え(FR-15)。
 * 各ユニット(結合ブロック・単独ストローク・塗りブロック共通)は始点・終点のどちらが現在地に
 * 近いかで採用方向を決める。O(n^2)。
 */
export function greedyOptimizeOrder(
  units: Endpoints[],
  start: Point,
  options: OrderOptions = DEFAULT_ORDER_OPTIONS,
): SequenceOrder {
  const remaining = units.map((_, i) => i)
  const order: number[] = []
  const reversed: boolean[] = []
  let current = start

  for (let i = 0; i < units.length; i++) {
    const picked = options.reorderPaths
      ? pickNearest(units, remaining, current, options.reversePaths)
      : {
          pos: i,
          reversed: options.reversePaths && shouldReverse(units[i], current),
        }
    const chosenIdx = options.reorderPaths ? remaining[picked.pos] : i
    const unit = units[chosenIdx]
    order.push(chosenIdx)
    reversed.push(picked.reversed)
    current = picked.reversed ? unit.start : unit.end
    if (options.reorderPaths) remaining.splice(picked.pos, 1)
  }

  return { order, reversed }
}

/** 並び替え結果どおりに辿り終えたときのペン位置。対象が1つもなければstartのまま */
export function exitPointOf(
  units: Endpoints[],
  result: SequenceOrder,
  start: Point,
): Point {
  if (result.order.length === 0) return start
  const last = units[result.order.at(-1)!]
  return result.reversed.at(-1) ? last.start : last.end
}
