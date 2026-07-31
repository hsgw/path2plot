import type { Point } from '../types/geometry'
import { greedyOptimizeOrder } from './pathOptimize'
import { isSegmentInsidePolygon } from './polygonContain'

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export interface OrderedLine {
  line: Point[]
  /** true: このハッチ線はE(終点)→S(始点)の逆向きで訪れる */
  reversed: boolean
}

/**
 * ハッチ線の訪問順序・向きを、FR-15と同じ貪欲最近傍法(greedyOptimizeOrder)で決定する
 * (実際の連結はしない)。各ステップで、残りのハッチ線のうち始点・終点いずれか現在位置に
 * 近い方を採用し、終点の方が近ければ逆向き(E→S)で訪れる。行の生成順に縛られないため、
 * ハッチ行の幅が行ごとに変化する形状(45°・非正方形など)でも真の最近傍で並び替えられる。
 */
export function orderHatchLinesByNearestNeighbor(
  lines: Point[][],
): OrderedLine[] {
  if (lines.length === 0) return []
  const units = lines.map((line) => ({ start: line[0], end: line.at(-1)! }))
  const { order, reversed } = greedyOptimizeOrder(units, units[0].start)
  return order.map((lineIndex, i) => ({
    line: lines[lineIndex],
    reversed: reversed[i],
  }))
}

/**
 * FR-18: 並び替え済みのハッチ線を対象に、隣接ペアの実際の接続距離(採用した端点同士の距離)が
 * toleranceMm(=FR-19の線間隔)以下で、かつ接続線が塗り領域(boundaryPaths)からはみ出さない場合のみ
 * 実線で連結し、それ以外は新規チェーンを開始する。
 * 距離だけで判定すると、同一fill内に複数の島がある場合や穴をまたぐ場合に、
 * 距離は近いが塗りの外側を通る接続線が引かれてしまう(許容距離倍率を上げるほど起こりやすい)。
 */
function connectOrderedLines(
  ordered: OrderedLine[],
  toleranceMm: number,
  boundaryPaths: Point[][],
): Point[][] {
  if (ordered.length === 0) return []

  const orient = ({ line, reversed }: OrderedLine): Point[] =>
    reversed ? [...line].reverse() : [...line]

  const result: Point[][] = []
  let currentChain = orient(ordered[0])

  for (let i = 1; i < ordered.length; i++) {
    const oriented = orient(ordered[i])
    const tail = currentChain.at(-1)!

    if (
      dist(tail, oriented[0]) <= toleranceMm &&
      isSegmentInsidePolygon(tail, oriented[0], boundaryPaths)
    ) {
      currentChain.push(...oriented)
    } else {
      result.push(currentChain)
      currentChain = oriented
    }
  }
  result.push(currentChain)
  return result
}

/**
 * FR-18: ハッチ線をジグザグ(一筆書き)に連結する。orderHatchLinesByNearestNeighborで
 * 決めた最近傍順序・向きに対し、connectOrderedLinesで許容距離判定・はみ出し判定・実際の連結を行う。
 * boundaryPathsにはハッチ線のクリップに使ったものと同じ塗り領域(FR-20のオフセット後の輪郭)を渡す。
 */
export function connectHatchLines(
  lines: Point[][],
  toleranceMm: number,
  boundaryPaths: Point[][],
): Point[][] {
  return connectOrderedLines(
    orderHatchLinesByNearestNeighbor(lines),
    toleranceMm,
    boundaryPaths,
  )
}
