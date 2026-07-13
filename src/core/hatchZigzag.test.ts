import { describe, expect, it } from 'vitest'
import type { Point } from '../types/geometry'
import { generateHatchLines } from './hatchGenerate'
import {
  connectHatchLines,
  orderHatchLinesByNearestNeighbor,
} from './hatchZigzag'

function makeRows(count: number, width: number, spacing: number): Point[][] {
  const rows: Point[][] = []
  for (let i = 0; i < count; i++) {
    const y = spacing / 2 + i * spacing
    rows.push([
      { x: 0, y },
      { x: width, y },
    ])
  }
  return rows
}

function chainLength(chain: Point[]): number {
  let total = 0
  for (let i = 1; i < chain.length; i++) {
    total += Math.hypot(
      chain[i].x - chain[i - 1].x,
      chain[i].y - chain[i - 1].y,
    )
  }
  return total
}

describe('orderHatchLinesByNearestNeighbor(FR-18: 訪問順序・向きの最適化)', () => {
  it('等幅の行では生成順のまま、終点が近い行を交互に逆向きで訪れる(標準的なジグザグ)', () => {
    const rows = makeRows(4, 10, 1)
    const ordered = orderHatchLinesByNearestNeighbor(rows)
    expect(ordered.map((o) => o.reversed)).toEqual([false, true, false, true])
    // 各訪問間の実際の接続距離(採用した端点同士)は行間隔(1mm)のみで済む
    for (let i = 1; i < ordered.length; i++) {
      const prevExit = ordered[i - 1].reversed
        ? ordered[i - 1].line[0]
        : ordered[i - 1].line.at(-1)!
      const curEntry = ordered[i].reversed
        ? ordered[i].line.at(-1)!
        : ordered[i].line[0]
      expect(
        Math.hypot(prevExit.x - curEntry.x, prevExit.y - curEntry.y),
      ).toBeCloseTo(1, 5)
    }
  })
})

describe('connectHatchLines(FR-18: ジグザグ結合)', () => {
  it('行幅が一定の矩形は全行が1本のチェーンに、短い接続のみで連結される', () => {
    const rows = makeRows(10, 10, 1)
    const chains = connectHatchLines(rows, 1)
    expect(chains.length).toBe(1)
    expect(chains[0].length).toBe(20)
  })

  it('穴をまたぐ行の折り返しは連結されず、複数のチェーンに分かれる', () => {
    const outer: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ]
    const hole: Point[] = [
      { x: 15, y: 15 },
      { x: 15, y: 25 },
      { x: 25, y: 25 },
      { x: 25, y: 15 },
    ]
    const lines = generateHatchLines([outer, hole], 0, 5)
    const chains = connectHatchLines(lines, 5)
    expect(chains.length).toBeGreaterThan(1)
  })

  it('45度で行幅が変化する矩形では、既定の許容距離(線間隔と同値)だけでは十分に連結できない', () => {
    // 実装時に確認した既知の幾何学的制約: 45度でコーナーを斜めに切ると、隣接行の最短距離は
    // 常に「線間隔×√2」以上になるため、等倍の許容距離では一筆書きになりきらない
    const rect: Point[] = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 70 },
      { x: 10, y: 70 },
    ]
    const rawLines = generateHatchLines([rect], 45, 5)
    const chains = connectHatchLines(rawLines, 5)
    expect(chains.length).toBeGreaterThan(1)
  })

  it('45度で行幅が変化する矩形でも、許容距離の倍率を十分大きくすれば1本のチェーンにまとまる', () => {
    const rect: Point[] = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 70 },
      { x: 10, y: 70 },
    ]
    const rawLines = generateHatchLines([rect], 45, 5)
    const chains = connectHatchLines(rawLines, 5 * 3)
    expect(chains.length).toBe(1)
  })

  it('チェーンの実際の描画長は、元の各ハッチ線の長さの合計より長くなる(接続線の分)が、極端に長くはならない', () => {
    const rows = makeRows(5, 10, 1)
    const rawTotal = rows.reduce((acc, r) => acc + chainLength(r), 0)
    const chains = connectHatchLines(rows, 1)
    const connectedTotal = chains.reduce((acc, c) => acc + chainLength(c), 0)
    expect(connectedTotal).toBeGreaterThan(rawTotal)
    // 接続線は行間隔(1mm)×4回分のみで済むはず(5行→4回の接続)
    expect(connectedTotal - rawTotal).toBeCloseTo(4, 5)
  })

  it('connectHatchLinesは入力の配列を破壊的に変更しない', () => {
    const rows = makeRows(5, 10, 1)
    const before = JSON.parse(JSON.stringify(rows))
    connectHatchLines(rows, 1)
    expect(rows).toEqual(before)
  })
})
