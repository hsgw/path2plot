import type { Point } from '../geometry/types'
import { distance } from '../geometry/vector'
import type { ParsedStroke } from '../svg/types'
import type { BlockMember, JoinedBlock } from './types'

/**
 * FR-14: 結合距離の初期値。「ペン設定」でペン先の太さが入力されると、変更された瞬間に
 * その値へ一度だけ更新される(App.tsxのhandlePenWidthChange)。太さが未入力のままの場合は
 * 引き続きこのフォールバック値の0.5mmを既定とする
 */
export const DEFAULT_JOIN_DISTANCE_MM = 0.5

type EndName = 'start' | 'end'

/** 個別上書き(FR-14)のMapキー。ストロークidの順序に依存しないよう正規化する */
export function joinOverrideKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`
}

interface Candidate {
  a: number
  aEnd: EndName
  b: number
  bEnd: EndName
  distance: number
  forced: boolean
}

class DisjointSet {
  private readonly parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]
      x = this.parent[x]
    }
    return x
  }
  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[ra] = rb
  }
}

/**
 * 端点同士が指定距離以下のストロークを結合ブロック化する(FR-14)。
 * 候補は距離昇順(強制結合は最優先)でグリーディに採用し、各ストロークの各端点は最大1回しか
 * 使用しない・同一連結成分への再結合(閉ループ化)は避けるという制約でチェーンを構成する。
 * overridesで明示的に false/true が指定されたペアは、距離閾値に関わらずそれぞれ非結合/結合を強制する。
 *
 * 候補列挙は全ペア総当たり(O(n^2))ではなく、セルサイズ=joinDistanceMmの空間ハッシュグリッドで
 * 各端点の近傍(自セル+周囲8セル)のみを探索する。距離<=joinDistanceMmのペアはこの3x3近傍探索で
 * 漏れなく捕捉できる(セルサイズ>=探索半径の空間ハッシュの標準的な性質)。overridesで強制結合(true)
 * されたペアは距離に関わらず必要なため、グリッド探索とは別に個別処理する。
 */
export function buildJoinedBlocks(
  strokes: ParsedStroke[],
  joinDistanceMm: number,
  overrides: Map<string, boolean>,
): JoinedBlock[] {
  const n = strokes.length
  const endPoint = (i: number, end: EndName): Point =>
    end === 'start' ? strokes[i].points[0] : strokes[i].points.at(-1)!
  const ends: EndName[] = ['start', 'end']

  const bestCandidateForPair = (
    i: number,
    j: number,
    forced: boolean,
  ): Candidate => {
    let best: Candidate | null = null
    for (const aEnd of ends) {
      for (const bEnd of ends) {
        const d = distance(endPoint(i, aEnd), endPoint(j, bEnd))
        if (!best || d < best.distance) {
          best = { a: i, aEnd, b: j, bEnd, distance: d, forced }
        }
      }
    }
    return best!
  }
  const pairKey = (i: number, j: number): string =>
    i < j ? `${i}:${j}` : `${j}:${i}`

  const idToIndex = new Map<string, number>()
  for (let i = 0; i < n; i++) idToIndex.set(strokes[i].id, i)

  const skipPairs = new Set<string>()
  const candidateByPair = new Map<string, Candidate>()

  for (const [key, join] of overrides) {
    const sep = key.indexOf('|')
    const i = idToIndex.get(key.slice(0, sep))
    const j = idToIndex.get(key.slice(sep + 1))
    if (i === undefined || j === undefined) continue
    if (join === false) {
      skipPairs.add(pairKey(i, j))
    } else {
      candidateByPair.set(pairKey(i, j), bestCandidateForPair(i, j, true))
    }
  }

  if (joinDistanceMm > 0) {
    const cellSize = joinDistanceMm
    const cellIndex = (v: number): number => Math.floor(v / cellSize)
    const cellKey = (cx: number, cy: number): string => `${cx}:${cy}`
    const grid = new Map<string, number[]>()
    const addToGrid = (i: number, p: Point): void => {
      const key = cellKey(cellIndex(p.x), cellIndex(p.y))
      const bucket = grid.get(key)
      if (bucket) bucket.push(i)
      else grid.set(key, [i])
    }
    for (let i = 0; i < n; i++) {
      addToGrid(i, endPoint(i, 'start'))
      addToGrid(i, endPoint(i, 'end'))
    }

    for (let i = 0; i < n; i++) {
      for (const aEnd of ends) {
        const p = endPoint(i, aEnd)
        const cx = cellIndex(p.x)
        const cy = cellIndex(p.y)
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const bucket = grid.get(cellKey(cx + dx, cy + dy))
            if (!bucket) continue
            for (const j of bucket) {
              if (j <= i) continue
              const pk = pairKey(i, j)
              if (skipPairs.has(pk) || candidateByPair.has(pk)) continue
              const candidate = bestCandidateForPair(i, j, false)
              if (candidate.distance <= joinDistanceMm) {
                candidateByPair.set(pk, candidate)
              }
            }
          }
        }
      }
    }
  }

  const candidates = Array.from(candidateByPair.values())

  candidates.sort((x, y) => {
    if (x.forced !== y.forced) return x.forced ? -1 : 1
    return x.distance - y.distance
  })

  const usedEnd = new Set<string>()
  const dsu = new DisjointSet(n)
  const links: Record<
    number,
    Partial<Record<EndName, { stroke: number; end: EndName }>>
  > = {}
  for (let i = 0; i < n; i++) links[i] = {}

  for (const c of candidates) {
    const keyA = `${c.a}:${c.aEnd}`
    const keyB = `${c.b}:${c.bEnd}`
    if (usedEnd.has(keyA) || usedEnd.has(keyB)) continue
    if (dsu.find(c.a) === dsu.find(c.b)) continue
    usedEnd.add(keyA)
    usedEnd.add(keyB)
    dsu.union(c.a, c.b)
    links[c.a][c.aEnd] = { stroke: c.b, end: c.bEnd }
    links[c.b][c.bEnd] = { stroke: c.a, end: c.aEnd }
  }

  const visited = new Array(n).fill(false)
  const blocks: JoinedBlock[] = []

  const buildChainFrom = (
    startStroke: number,
    entryEnd: EndName,
  ): BlockMember[] => {
    const members: BlockMember[] = []
    let curStroke = startStroke
    let curEnd = entryEnd
    while (!visited[curStroke]) {
      visited[curStroke] = true
      members.push({ strokeIndex: curStroke, reversed: curEnd === 'end' })
      const outEnd: EndName = curEnd === 'start' ? 'end' : 'start'
      const next = links[curStroke][outEnd]
      if (!next) break
      curStroke = next.stroke
      curEnd = next.end
    }
    return members
  }

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue
    if (!links[i].start) {
      blocks.push({ members: buildChainFrom(i, 'start') })
    } else if (!links[i].end) {
      blocks.push({ members: buildChainFrom(i, 'end') })
    }
  }
  // DSUが閉ループ化を防いでいるため到達しない想定だが、念のための救済処理
  for (let i = 0; i < n; i++) {
    if (!visited[i]) blocks.push({ members: buildChainFrom(i, 'start') })
  }

  blocks.sort(
    (a, b) =>
      Math.min(...a.members.map((m) => m.strokeIndex)) -
      Math.min(...b.members.map((m) => m.strokeIndex)),
  )

  return blocks
}

/**
 * 結合ブロックを実際のストローク列・連結済み点列に変換する。
 * overallReversedでブロック全体の向きを反転する(内部メンバー順序も反転し、各メンバーの
 * reversedとXORして最終的な向きを決める。FR-14: ブロック内部の結合順・順序自体は変えない)
 */
export function materializeBlock(
  block: JoinedBlock,
  strokes: ParsedStroke[],
  overallReversed: boolean,
): { strokes: ParsedStroke[]; points: Point[] } {
  const members = overallReversed ? [...block.members].reverse() : block.members
  const resultStrokes = members.map((m) => {
    const finalReversed = m.reversed !== overallReversed
    const s = strokes[m.strokeIndex]
    return finalReversed ? { ...s, points: [...s.points].reverse() } : s
  })
  const points = resultStrokes.flatMap((s) => s.points)
  return { strokes: resultStrokes, points }
}
