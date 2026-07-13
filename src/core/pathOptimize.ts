import type { Point } from '../types/geometry'
import type { ParsedStroke } from '../types/svg'

export interface BlockMember {
  strokeIndex: number
  /** true: このストロークをブロック内で元のpoints順とは逆向きに辿る */
  reversed: boolean
}

export interface JoinedBlock {
  members: BlockMember[]
}

type EndName = 'start' | 'end'

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

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
 */
export function buildJoinedBlocks(
  strokes: ParsedStroke[],
  joinDistanceMm: number,
  overrides: Map<string, boolean>,
): JoinedBlock[] {
  const n = strokes.length
  const endPoint = (i: number, end: EndName): Point =>
    end === 'start' ? strokes[i].points[0] : strokes[i].points.at(-1)!

  const candidates: Candidate[] = []
  const ends: EndName[] = ['start', 'end']

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const override = overrides.get(
        joinOverrideKey(strokes[i].id, strokes[j].id),
      )
      if (override === false) continue

      let best: Candidate | null = null
      for (const aEnd of ends) {
        for (const bEnd of ends) {
          const d = dist(endPoint(i, aEnd), endPoint(j, bEnd))
          if (!best || d < best.distance) {
            best = {
              a: i,
              aEnd,
              b: j,
              bEnd,
              distance: d,
              forced: override === true,
            }
          }
        }
      }
      if (!best) continue
      if (override === true || best.distance <= joinDistanceMm) {
        candidates.push(best)
      }
    }
  }

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

/**
 * ペンアップ移動距離の最小化を目的とした貪欲法(最近傍逐次選択)による並び替え(FR-15)。
 * 各ユニット(結合ブロック・単独ストローク・塗りブロック共通)は始点・終点のどちらが現在地に
 * 近いかで採用方向を決める。O(n^2)。
 */
export function greedyOptimizeOrder(
  units: { start: Point; end: Point }[],
  start: Point,
): { order: number[]; reversed: boolean[] } {
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
      const dStart = dist(current, unit.start)
      const dEnd = dist(current, unit.end)
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
