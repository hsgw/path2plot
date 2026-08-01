import type { Point } from '../types/geometry'
import type { HatchRow, HatchSegment } from './hatchGenerate'
import { createContourTracer } from './contourTrace'
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

// ---------------------------------------------------------------------------
// 断片の並べ方(標準順)
// ---------------------------------------------------------------------------

interface FlatSegment {
  rowIndex: number
  segment: HatchSegment
}

function overlaps(a: HatchSegment, b: HatchSegment): boolean {
  return Math.min(a.xEnd, b.xEnd) - Math.max(a.xStart, b.xStart) > 0
}

function flatten(rows: HatchRow[]): FlatSegment[] {
  return rows.flatMap((row) =>
    row.segments.map((segment) => ({ rowIndex: row.rowIndex, segment })),
  )
}

/**
 * 断片を「縦に連なった柱」(boustrophedon cell decomposition のセルに相当)へ分解し、
 * 柱ごとに連結した1本の配列として返す。
 *
 * 隣接行の断片同士が回転空間のx範囲で重なり、かつその対応が1対1のときだけ連結し、
 * 分岐(1つの断片が次の行の2つ以上に重なる)・合流が起きる位置で柱を切る。
 * ジグザグは1つの断片から端点を1つしか使わないため、この分解を行わないと穴の反対側の断片が
 * 描き残される。単純な連結成分(Union-Find)ではドーナツが上下でつながって1グループになり
 * 分解にならないため、1対1の対応であることを条件にしている。
 */
function orderByColumn(rows: HatchRow[]): FlatSegment[] {
  const flat = flatten(rows)
  const n = flat.length
  const next = new Array<number>(n).fill(-1)
  const prev = new Array<number>(n).fill(-1)

  // flatはrowsの並び(行番号昇順・行内x昇順)そのままなので、行ごとの範囲を順に切り出せる
  const rowRanges: { rowIndex: number; from: number; to: number }[] = []
  let cursor = 0
  for (const row of rows) {
    rowRanges.push({
      rowIndex: row.rowIndex,
      from: cursor,
      to: cursor + row.segments.length,
    })
    cursor += row.segments.length
  }

  for (let r = 0; r + 1 < rowRanges.length; r++) {
    const cur = rowRanges[r]
    const nxt = rowRanges[r + 1]
    // 間に空の行が挟まっている(行番号が飛んでいる)なら材料が途切れているので連結しない
    if (nxt.rowIndex - cur.rowIndex !== 1) continue

    for (let i = cur.from; i < cur.to; i++) {
      let matched = -1
      let forwardCount = 0
      for (let j = nxt.from; j < nxt.to; j++) {
        if (overlaps(flat[i].segment, flat[j].segment)) {
          matched = j
          forwardCount++
        }
      }
      if (forwardCount !== 1) continue

      let backwardCount = 0
      for (let k = cur.from; k < cur.to; k++) {
        if (overlaps(flat[k].segment, flat[matched].segment)) backwardCount++
      }
      if (backwardCount !== 1) continue

      next[i] = matched
      prev[matched] = i
    }
  }

  const ordered: FlatSegment[] = []
  for (let i = 0; i < n; i++) {
    if (prev[i] !== -1) continue
    for (let k = i; k !== -1; k = next[k]) ordered.push(flat[k])
  }
  return ordered
}

/**
 * 往復の標準順: 行番号昇順に辿り、偶数行は左→右、奇数行は右→左に向きを揃える。
 * 接続が常に「同じ側の端点同士」になるため距離が予測可能になる。
 * 行が穴で分断されている場合は、行内の断片も同じ向きの順序で消費する。
 */
function orderByRow(rows: HatchRow[]): FlatSegment[] {
  return rows.flatMap((row) => {
    const forward = ((row.rowIndex % 2) + 2) % 2 === 0
    const segments = forward ? row.segments : [...row.segments].reverse()
    return segments.map((segment) => ({ rowIndex: row.rowIndex, segment }))
  })
}

// ---------------------------------------------------------------------------
// 共通の連結ドライバ
// ---------------------------------------------------------------------------

/** 1つの断片を「どう訪れるか」。entryは入る点、exitは出る点、pointsは実際に描く点列 */
interface Visit {
  points: Point[]
  entry: Point
  exit: Point
  /** ジグザグのみ: この訪れ方が断片の左右どちらの端点を使ったか */
  side?: 'left' | 'right'
}

/** 接続の結果。pointsは間に挟む中間点(不要なら空配列)、commitは採用が確定したときの後処理 */
interface Link {
  points: Point[]
  commit?: () => void
}

interface ConnectMode {
  /** 標準順に並んだ断片列 */
  order: FlatSegment[]
  /** 断片の訪れ方の候補(先頭が標準の訪れ方) */
  visits: (item: FlatSegment, index: number, state: DriverState) => Visit[]
  /** 訪問後に状態を更新する */
  advance: (visit: Visit, state: DriverState) => void
  /**
   * fromからtoへ繋げるか。繋げないならnull。
   * preferred=trueは「標準順で直後の断片」への接続であることを表す
   */
  link: (from: Point, to: Point, preferred: boolean) => Link | null
  /**
   * フォールバック探索で候補として許容する、現在位置から候補の入る点までの直線距離の上限(mm)。
   * 標準順で直後の断片(=リスト上の次のライン)には適用しない。undefinedなら無制限
   */
  maxFallbackDistanceMm?: number
  /**
   * 直前に訪れた断片から候補の断片へ進んでよいか(幾何的な隣接条件)。
   * 未指定なら制限しない。優先候補・フォールバック候補の両方に適用する
   */
  canFollow?: (from: FlatSegment, to: FlatSegment) => boolean
  /** 点が1つしか集まらなかったチェーンの救済(ジグザグのみ) */
  rescueSinglePoint: boolean
}

interface DriverState {
  /** ジグザグの左右交互を表す。往復では使わない */
  side: 'left' | 'right'
}

function runConnect(mode: ConnectMode): Point[][] {
  const { order } = mode
  const n = order.length
  if (n === 0) return []

  const visited = new Array<boolean>(n).fill(false)
  const state: DriverState = { side: 'left' }
  const result: Point[][] = []

  // 進行中のチェーンはクロージャ(take/flush)からも書き換わるため、オブジェクトに載せて保持する
  const acc: { chain: Point[] | null; firstSegment: HatchSegment | null } = {
    chain: null,
    firstSegment: null,
  }
  let lastIndex = -1
  let remaining = n

  const flush = (): void => {
    const { chain, firstSegment } = acc
    if (!chain) return
    if (chain.length >= 2) result.push(chain)
    else if (mode.rescueSinglePoint && firstSegment) {
      // ジグザグを組めなかった断片は、描き残しを避けるため断片自体を1本の線として出力する
      result.push([...firstSegment.points])
    }
    acc.chain = null
    acc.firstSegment = null
  }

  const take = (index: number, visit: Visit, link: Link | null): void => {
    if (acc.chain) acc.chain.push(...(link?.points ?? []), ...visit.points)
    else {
      acc.chain = [...visit.points]
      acc.firstSegment = order[index].segment
    }
    link?.commit?.()
    mode.advance(visit, state)
    visited[index] = true
    lastIndex = index
    remaining--
  }

  const firstUnvisited = (): number => {
    for (let i = 0; i < n; i++) if (!visited[i]) return i
    return -1
  }

  while (remaining > 0) {
    if (acc.chain === null) {
      const start = firstUnvisited()
      take(start, mode.visits(order[start], start, state)[0], null)
      continue
    }

    const tail = acc.chain.at(-1)!
    let chosen: { index: number; visit: Visit; link: Link } | null = null
    // canFollowは「直前に訪れた断片からの隣接」を見る条件なので、進行中のチェーンがある間は
    // lastIndexが必ず有効(chainがnullでない=1つ以上訪問済み)
    const previous = order[lastIndex]
    const followable = (index: number): boolean =>
      mode.canFollow === undefined || mode.canFollow(previous, order[index])

    // 1. 優先候補: 標準順で直後の断片
    const successor = lastIndex + 1
    if (successor < n && !visited[successor] && followable(successor)) {
      for (const visit of mode.visits(order[successor], successor, state)) {
        const link = mode.link(tail, visit.entry, true)
        if (link) {
          chosen = { index: successor, visit, link }
          break
        }
      }
    }

    // 2. フォールバック: 未訪問の断片全体から、接続できるもののうち最も近いもの。
    //    標準順の直後だけを見ていると、図の上では隣接しているのに配列上は離れている断片が
    //    繋がらず、無用にチェーンが分割される
    if (!chosen) {
      const candidates: { index: number; visit: Visit; distance: number }[] = []
      for (let i = 0; i < n; i++) {
        if (visited[i] || !followable(i)) continue
        for (const visit of mode.visits(order[i], i, state)) {
          candidates.push({
            index: i,
            visit,
            distance: dist(tail, visit.entry),
          })
        }
      }
      // 近い順に、実際に繋げるものが見つかるまで試す
      candidates.sort((a, b) => a.distance - b.distance)
      for (const c of candidates) {
        if (
          mode.maxFallbackDistanceMm !== undefined &&
          c.distance > mode.maxFallbackDistanceMm
        ) {
          // 以降はさらに遠いので打ち切る
          break
        }
        const link = mode.link(tail, c.visit.entry, false)
        if (link) {
          chosen = { index: c.index, visit: c.visit, link }
          break
        }
      }
    }

    if (chosen) {
      take(chosen.index, chosen.visit, chosen.link)
    } else {
      flush()
    }
  }
  flush()

  return result
}

// ---------------------------------------------------------------------------
// 各モード
// ---------------------------------------------------------------------------

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
      const forward = ((rowIndex % 2) + 2) % 2 === 0
      const asIs = [...segment.points]
      const flipped = [...segment.points].reverse()
      // 標準は行番号の偶奇どおりの向き。フォールバックでは逆向きも候補にする
      return forward
        ? [asVisit(asIs), asVisit(flipped)]
        : [asVisit(flipped), asVisit(asIs)]
    },
    advance: () => {},
    // 輪郭をなぞれるときだけ繋ぐ。'overlap'(なぞり済み)も'unreachable'(別ループ)も繋がない
    link: (from, to) => {
      const traced = tracer.trace(from, to)
      if (traced.status !== 'ok') return null
      const { path } = traced
      return { points: path.vertices, commit: () => tracer.commit(path) }
    },
    maxFallbackDistanceMm,
    rescueSinglePoint: false,
  })
}
