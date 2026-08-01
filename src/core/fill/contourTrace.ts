import type { Point } from '../geometry/types'
import { distSqToSegment } from '../geometry/polygon'
// なぞり区間の重なり・接触の判定にも同じ許容量を使う(端点同士が触れるのは重なりとみなさない)
import { GEOMETRY_EPS_MM } from '../geometry/tolerance'
import { distance } from '../geometry/vector'

/** 輪郭上の点の位置。ループ番号と、ループ始点からの弧長で表す */
interface ContourLocation {
  loopIndex: number
  /** ループ始点(loop[0])からその点までの弧長 */
  arcPosition: number
}

/** 輪郭に沿った移動の経路。verticesはaもbも含まない中間頂点のみ */
export interface ContourPath {
  vertices: Point[]
  /** aからbまで輪郭に沿って進む距離 */
  length: number
  loopIndex: number
  /** 覆う区間の開始位置(ループ上の弧長)。lengthと合わせて区間を表す */
  start: number
}

interface LoopMetrics {
  /** cumulative[i] = loop[0]からloop[i]までの弧長 */
  cumulative: number[]
  perimeter: number
}

function measureLoop(loop: Point[]): LoopMetrics {
  const cumulative = new Array<number>(loop.length).fill(0)
  for (let i = 1; i < loop.length; i++) {
    cumulative[i] = cumulative[i - 1] + distance(loop[i - 1], loop[i])
  }
  const perimeter =
    cumulative[loop.length - 1] + distance(loop.at(-1)!, loop[0])
  return { cumulative, perimeter }
}

/**
 * 点が輪郭のどの位置にあるかを特定する。ハッチ線の端点はクリップ結果なので必ず輪郭上に
 * あるが、clipper2-tsの内部精度(1e-4mm)で丸められているため、最も近い辺を採用する。
 */
function locate(
  p: Point,
  paths: Point[][],
  metrics: LoopMetrics[],
): ContourLocation | null {
  let best: ContourLocation | null = null
  let bestDistSq = Infinity

  for (let loopIndex = 0; loopIndex < paths.length; loopIndex++) {
    const loop = paths[loopIndex]
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]
      const b = loop[(i + 1) % loop.length]
      const d = distSqToSegment(p, a, b)
      if (d < bestDistSq) {
        bestDistSq = d
        best = {
          loopIndex,
          arcPosition: metrics[loopIndex].cumulative[i] + distance(a, p),
        }
      }
    }
  }
  return best
}

/** startからループを正方向にspanだけ進んだときに通過する頂点列(通過順) */
function verticesBetween(
  loop: Point[],
  metrics: LoopMetrics,
  start: number,
  span: number,
): Point[] {
  const { cumulative, perimeter } = metrics
  const found: { index: number; at: number }[] = []
  // ラップする場合に備え、各頂点を1周ぶんずらした位置でも候補にする
  for (let index = 0; index < loop.length; index++) {
    for (let lap = 0; lap <= 1; lap++) {
      const at = cumulative[index] + lap * perimeter
      if (at > start + GEOMETRY_EPS_MM && at < start + span - GEOMETRY_EPS_MM) {
        found.push({ index, at })
      }
    }
  }
  return found.sort((a, b) => a.at - b.at).map((v) => loop[v.index])
}

/**
 * 輪郭上の2点a→bを、同じループ上の短い方の弧に沿って辿る経路を返す。
 * 別のループ上にある(穴の境界と外形をまたぐ)場合はnull。
 *
 * ハッチ線の端点は必ずオフセット後の輪郭上にあるため、輪郭に沿って移動すれば
 * 接続線が塗り領域からはみ出すことはない。
 */
export function traceAlongContour(
  a: Point,
  b: Point,
  paths: Point[][],
  metricsCache?: LoopMetrics[],
): ContourPath | null {
  if (paths.length === 0) return null
  const metrics = metricsCache ?? paths.map(measureLoop)

  const from = locate(a, paths, metrics)
  const to = locate(b, paths, metrics)
  if (!from || !to || from.loopIndex !== to.loopIndex) return null

  const loopIndex = from.loopIndex
  const loop = paths[loopIndex]
  if (loop.length < 2) return null
  const m = metrics[loopIndex]

  const forwardSpan =
    (((to.arcPosition - from.arcPosition) % m.perimeter) + m.perimeter) %
    m.perimeter
  const backwardSpan = m.perimeter - forwardSpan

  if (forwardSpan <= backwardSpan) {
    return {
      vertices: verticesBetween(loop, m, from.arcPosition, forwardSpan),
      length: forwardSpan,
      loopIndex,
      start: from.arcPosition,
    }
  }
  return {
    // 逆回りはb→aの並びで得られるので反転する
    vertices: verticesBetween(loop, m, to.arcPosition, backwardSpan).reverse(),
    length: backwardSpan,
    loopIndex,
    start: to.arcPosition,
  }
}

/**
 * なぞった区間を記録し、既になぞった区間と重なる経路を拒否するトレーサ。
 * 同じ輪郭を二度なぞると紙面で線が重なって濃くなるため(穴をまたぐ行ごとに
 * 穴の縁をなぞってしまうケースなど)、重複した移動を避けるのに使う。
 */
export function createContourTracer(paths: Point[][]) {
  const metrics = paths.map(measureLoop)
  // ループごとの、なぞり済み区間(ラップしない[start,end]に正規化して保持、重なるものは統合)
  const covered: { start: number; end: number }[][] = paths.map(() => [])

  const normalize = (
    loopIndex: number,
    start: number,
    span: number,
  ): { start: number; end: number }[] => {
    const { perimeter } = metrics[loopIndex]
    const s = ((start % perimeter) + perimeter) % perimeter
    if (span >= perimeter) return [{ start: 0, end: perimeter }]
    if (s + span <= perimeter) return [{ start: s, end: s + span }]
    return [
      { start: s, end: perimeter },
      { start: 0, end: s + span - perimeter },
    ]
  }

  const overlapLength = (
    loopIndex: number,
    parts: { start: number; end: number }[],
  ): number => {
    let total = 0
    for (const part of parts) {
      for (const c of covered[loopIndex]) {
        total += Math.max(
          0,
          Math.min(part.end, c.end) - Math.max(part.start, c.start),
        )
      }
    }
    return total
  }

  return {
    /**
     * aからbへ輪郭をなぞれるか。
     * 'ok'        … なぞれる
     * 'overlap'   … 経路は取れるが既になぞった区間と重なる(直線で代替してはいけない。
     *                直線も同じ輪郭上を通ることになり、結局二度描きになるため)
     * 'unreachable' … 別のループ上にあり輪郭では辿れない
     */
    trace(
      a: Point,
      b: Point,
    ):
      | { status: 'ok'; path: ContourPath }
      | { status: 'overlap' }
      | { status: 'unreachable' } {
      const path = traceAlongContour(a, b, paths, metrics)
      if (!path) return { status: 'unreachable' }
      const parts = normalize(path.loopIndex, path.start, path.length)
      if (overlapLength(path.loopIndex, parts) > GEOMETRY_EPS_MM) {
        return { status: 'overlap' }
      }
      return { status: 'ok', path }
    },
    /** 実際に採用した経路を「なぞり済み」として記録する */
    commit(path: ContourPath): void {
      const parts = normalize(path.loopIndex, path.start, path.length)
      const list = covered[path.loopIndex]
      for (const part of parts) list.push(part)
      // 重なる区間を統合してリストが伸び続けるのを防ぐ
      list.sort((x, y) => x.start - y.start)
      const merged: { start: number; end: number }[] = []
      for (const part of list) {
        const last = merged.at(-1)
        if (last && part.start <= last.end + GEOMETRY_EPS_MM) {
          last.end = Math.max(last.end, part.end)
        } else merged.push({ ...part })
      }
      covered[path.loopIndex] = merged
    },
  }
}
