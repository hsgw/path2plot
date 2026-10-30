import type { Point } from '../../geometry/types'
import { distance } from '../../geometry/vector'
import type { HatchSegment } from './lines'
import type { FlatSegment } from './order'

/** 1つの断片を「どう訪れるか」。entryは入る点、exitは出る点、pointsは実際に描く点列 */
export interface Visit {
  points: Point[]
  entry: Point
  exit: Point
  /** ジグザグのみ: この訪れ方が断片の左右どちらの端点を使ったか */
  side?: 'left' | 'right'
}

/** 接続の結果。pointsは間に挟む中間点(不要なら空配列)、commitは採用が確定したときの後処理 */
export interface Link {
  points: Point[]
  commit?: () => void
}

export interface DriverState {
  /** ジグザグの左右交互を表す。往復では使わない */
  side: 'left' | 'right'
}

/** 連結モード(ジグザグ・往復)ごとの差分を、共通ドライバへ渡すための定義 */
export interface ConnectMode {
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

/**
 * 連結の共通ドライバ。標準順の断片列を先頭から消費し、
 * 「標準順で直後の断片」→「未訪問の中で最も近い断片」の順に接続先を探す。
 * どちらも繋げなければ現在のチェーンを確定し、未訪問の先頭から次のチェーンを始める。
 */
export function runConnect(mode: ConnectMode): Point[][] {
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

    const findPreferredCandidate = (): {
      index: number
      visit: Visit
      link: Link
    } | null => {
      // 1. 優先候補: 標準順で直後の断片
      const successor = lastIndex + 1
      if (successor < n && !visited[successor] && followable(successor)) {
        for (const visit of mode.visits(order[successor], successor, state)) {
          const link = mode.link(tail, visit.entry, true)
          if (link) return { index: successor, visit, link }
        }
      }
      return null
    }

    const findFallbackCandidate = (): {
      index: number
      visit: Visit
      link: Link
    } | null => {
      // 2. フォールバック: 未訪問の断片全体から、接続できるもののうち最も近いもの。
      //    標準順の直後だけを見ていると、図の上では隣接しているのに配列上は離れている断片が
      //    繋がらず、無用にチェーンが分割される
      const candidates: { index: number; visit: Visit; distance: number }[] = []
      for (let i = 0; i < n; i++) {
        if (visited[i] || !followable(i)) continue
        for (const visit of mode.visits(order[i], i, state)) {
          candidates.push({
            index: i,
            visit,
            distance: distance(tail, visit.entry),
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
          return { index: c.index, visit: c.visit, link }
        }
      }
      return null
    }
    chosen = findPreferredCandidate() ?? findFallbackCandidate()

    if (chosen) {
      take(chosen.index, chosen.visit, chosen.link)
    } else {
      flush()
    }
  }
  flush()

  return result
}
