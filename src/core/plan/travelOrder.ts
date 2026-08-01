import type { Point } from '../geometry/types'
import { distance } from '../geometry/vector'
import type { UnitOrder } from './types'

/**
 * ペンアップ移動距離の最小化を目的とした貪欲法(最近傍逐次選択)による並び替え(FR-15)。
 * 各ユニット(結合ブロック・単独ストローク・塗りブロック共通)は始点・終点のどちらが現在地に
 * 近いかで採用方向を決める。O(n^2)。
 */
export function greedyOptimizeOrder(
  units: { start: Point; end: Point }[],
  start: Point,
): UnitOrder {
  const remaining = units.map((_, i) => i)
  const order: number[] = []
  const reversed: boolean[] = []
  let current = start

  while (remaining.length > 0) {
    let bestPos = 0
    let bestReversed = false
    let bestDistance = Infinity

    for (let k = 0; k < remaining.length; k++) {
      const unit = units[remaining[k]]
      const dStart = distance(current, unit.start)
      const dEnd = distance(current, unit.end)
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

    const chosenIdx = remaining[bestPos]
    const unit = units[chosenIdx]
    order.push(chosenIdx)
    reversed.push(bestReversed)
    current = bestReversed ? unit.start : unit.end
    remaining.splice(bestPos, 1)
  }

  return { order, reversed }
}
