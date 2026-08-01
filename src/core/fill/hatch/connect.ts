import type { Point } from '../../geometry/types'
import { isSegmentInsidePolygon } from '../../geometry/polygon'
import { greedyOptimizeOrder } from '../../plan/travelOrder'
import { createContourTracer } from '../contourTrace'
import type { HatchRow, HatchSegment } from './lines'
import { runConnect, type Visit } from './driver'
import { isForwardRow, orderByColumn, orderByRow, overlaps } from './order'

export interface OrderedLine {
  line: Point[]
  /** true: このハッチ線はE(終点)→S(始点)の逆向きで訪れる */
  reversed: boolean
}

/**
 * ハッチ線の訪問順序・向きを、FR-15と同じ貪欲最近傍法(greedyOptimizeOrder)で決定する
 * (連結はしない)。connect==='none'のときにペンアップ移動距離を減らすために使う。
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

/** connect==='none'用: 順序・向きだけ最適化した個別チェーン(1本ごとにペンアップ移動)にする */
export function orderHatchLinesAsChains(lines: Point[][]): Point[][] {
  return orderHatchLinesByNearestNeighbor(lines).map(({ line, reversed }) =>
    reversed ? [...line].reverse() : [...line],
  )
}

/**
 * FR-18(ジグザグ): 各行の左右の端点を交互に拾い、斜めに繋いだ一筆書きを作る
 * (L0→R1→L2→R3…)。ハッチ線そのものは描かず、この折れ線自体が塗りになる。
 *
 * 斜めの接続線は行の長さに比例して長くなるため、線間隔基準の距離判定は意味をなさない。
 * 分割するかどうかは塗り領域の内外判定(isSegmentInsidePolygon)だけで決める。
 * 往復と違い輪郭をなぞることはしない(常に直線で渡る)。
 *
 * 接続先は必ず「直前に使った端点の反対側」に限る。同じ側の端点へは繋がない
 * (それを許すとジグザグの左右交互という性質そのものが崩れる)。
 * 反対側の端点へ繋げる断片が1つも見つからなければ、そこでチェーンを終える。
 *
 * さらに、進める先を「行番号が隣接し、かつ回転空間のx範囲が重なる断片」に限る。
 * 塗り領域の内外判定だけでは足りないため。星形のような単一の凹形状では、腕から腕へ引いた線も
 * 「内側」と判定されてしまい、塗りを長く横断する線が引かれていた
 * (実測: 5芒星で行を12も飛び越える40.5mmの接続)。
 * ジグザグの正常な一歩は必ず「1行進んで横に重なる断片へ渡る」ので、この条件で横断線だけが落ちる。
 */
export function connectHatchRowsZigzag(
  rows: HatchRow[],
  boundaryPaths: Point[][],
): Point[][] {
  const pick = (segment: HatchSegment, side: 'left' | 'right'): Visit => {
    const p = side === 'left' ? segment.points[0] : segment.points.at(-1)!
    return { points: [p], entry: p, exit: p, side }
  }

  return runConnect({
    order: orderByColumn(rows),
    // 左右交互を崩さないため、その時点で使うべき側の端点しか候補にしない
    visits: ({ segment }, _index, state) => [pick(segment, state.side)],
    // 実際に使った端点の反対側を次の標準にする(柱をまたいでも交互を保つ)
    advance: (visit, state) => {
      state.side = visit.side === 'left' ? 'right' : 'left'
    },
    link: (from, to) =>
      isSegmentInsidePolygon(from, to, boundaryPaths) ? { points: [] } : null,
    // 1行だけ進み、横にも重なっている断片にしか渡らない(overlapsはorderByColumnと同じ判定)
    canFollow: (from, to) =>
      Math.abs(to.rowIndex - from.rowIndex) === 1 &&
      overlaps(from.segment, to.segment),
    rescueSinglePoint: true,
  })
}

/**
 * FR-18(往復・牛耕式): ハッチ線を描き、隣接行の同じ側の端点同士を繋ぐ。
 *
 * 端点同士の移動は**輪郭(オフセット後の輪郭)をなぞる場合のみ**行う。ハッチ線の端点は
 * クリップ結果なので必ず輪郭上にあり、同じ輪郭ループ上の2点なら輪郭に沿って辿れば
 * 必ず塗り領域内に収まる。別のループにある(穴の境界と外形をまたぐ)場合は輪郭を辿れないので
 * 繋がない。
 *
 * 以前は辿れない場合に直線で代替し、はみ出し判定だけで可否を決めていた。しかし塗り領域の
 * 内側であっても、ハッチとも輪郭とも無関係な角度の線が引かれるため、複数ループを持つ形状
 * (「永」の字など)で塗りを横切る線として見えてしまう。実測ではこの直線代替が使われるのは
 * 全fixtureで391本中1本だけだったので、分岐ごと廃止した。
 *
 * 一度なぞった輪郭区間は二度なぞらない。なぞった分は実際に描かれるため、同じ場所を何度も
 * 通ると紙面で線が重なって濃くなる(穴をまたぐ行ごとに穴の縁をなぞってしまうケースなど)。
 *
 * 接続先を探す範囲はmaxFallbackDistanceMm(端点までの直線距離)で制限する。なぞる距離では
 * なく直線距離を基準にするのは、複雑で小さな図形では「すぐ隣なのに輪郭を大きく回り込む」
 * 経路が現れ、なぞり距離で切ると却って遠くへ繋ぎ直してしまうため。
 * 「標準順で直後の断片」(=リスト上の次のライン)への接続には距離制限をかけない。
 *
 * ただし**なぞる距離そのもの**には、直線距離とは別に同じ値を上限として掛ける。細い矩形枠のような
 * 形状では、1本の走査線が枠を横切ってできる左右の断片の端点がどちらも内側ループ上にあるため、
 * 「内周の半分を大回りする」経路(実測197mm)が輪郭なぞりとして成立してしまう。この経路は
 * そのまま実線で描かれるうえ、なぞり済み区間として記録されるので、以降の行の短い接続が軒並み
 * overlapで拒否されチェーンが粉々になる(実測: 帯幅1mm・線間隔1mm・45°で断片284個が71本に分裂、
 * うち接続失敗139件が全てoverlap)。直線距離の上限では「端点同士は近いが経路が長い」この経路を
 * 切れないため、なぞり距離側の上限が必要。
 */
export function connectHatchRowsBoustrophedon(
  rows: HatchRow[],
  boundaryPaths: Point[][],
  maxFallbackDistanceMm: number,
): Point[][] {
  const asVisit = (points: Point[]): Visit => ({
    points,
    entry: points[0],
    exit: points.at(-1)!,
  })
  const tracer = createContourTracer(boundaryPaths)

  return runConnect({
    order: orderByRow(rows),
    visits: ({ rowIndex, segment }) => {
      const asIs = [...segment.points]
      const flipped = [...segment.points].reverse()
      // 標準は行番号の偶奇どおりの向き。フォールバックでは逆向きも候補にする
      return isForwardRow(rowIndex)
        ? [asVisit(asIs), asVisit(flipped)]
        : [asVisit(flipped), asVisit(asIs)]
    },
    advance: () => {},
    // 輪郭をなぞれるときだけ繋ぐ。'overlap'(なぞり済み)も'unreachable'(別ループ)も繋がない
    link: (from, to) => {
      const traced = tracer.trace(from, to)
      if (traced.status !== 'ok') return null
      const { path } = traced
      if (path.length > maxFallbackDistanceMm) return null
      return { points: path.vertices, commit: () => tracer.commit(path) }
    },
    maxFallbackDistanceMm,
    rescueSinglePoint: false,
  })
}
