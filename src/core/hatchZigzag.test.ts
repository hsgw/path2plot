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

/** makeRowsで作った行群をちょうど包む矩形(=ハッチ線のクリップに使う塗り領域) */
function rowsBoundary(
  count: number,
  width: number,
  spacing: number,
): Point[][] {
  return [
    [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: count * spacing },
      { x: 0, y: count * spacing },
    ],
  ]
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
    const chains = connectHatchLines(rows, 1, rowsBoundary(10, 10, 1))
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
    const chains = connectHatchLines(lines, 5, [outer, hole])
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
    const chains = connectHatchLines(rawLines, 5, [rect])
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
    const chains = connectHatchLines(rawLines, 5 * 3, [rect])
    expect(chains.length).toBe(1)
  })

  it('チェーンの実際の描画長は、元の各ハッチ線の長さの合計より長くなる(接続線の分)が、極端に長くはならない', () => {
    const rows = makeRows(5, 10, 1)
    const rawTotal = rows.reduce((acc, r) => acc + chainLength(r), 0)
    const chains = connectHatchLines(rows, 1, rowsBoundary(5, 10, 1))
    const connectedTotal = chains.reduce((acc, c) => acc + chainLength(c), 0)
    expect(connectedTotal).toBeGreaterThan(rawTotal)
    // 接続線は行間隔(1mm)×4回分のみで済むはず(5行→4回の接続)
    expect(connectedTotal - rawTotal).toBeCloseTo(4, 5)
  })

  it('connectHatchLinesは入力の配列を破壊的に変更しない', () => {
    const rows = makeRows(5, 10, 1)
    const before = JSON.parse(JSON.stringify(rows))
    connectHatchLines(rows, 1, rowsBoundary(5, 10, 1))
    expect(rows).toEqual(before)
  })
})

describe('connectHatchLines(FR-18: 塗り領域外へのはみ出し防止)', () => {
  /** 同一fill内に離れた2つの島がある形状(隙間5mm) */
  const islands: Point[][] = [
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ],
    [
      { x: 15, y: 0 },
      { x: 25, y: 0 },
      { x: 25, y: 20 },
      { x: 15, y: 20 },
    ],
  ]

  it('許容距離を島の隙間より大きくしても、島をまたぐ接続線は引かれない', () => {
    const lines = generateHatchLines(islands, 0, 2)
    // 島Aを塗り終えた位置から島Bの入口までは15mm。距離判定だけなら許容距離20mm以内なので
    // 連結され、島Aの内部と隙間を横切る長い接続線が引かれてしまう
    const chains = connectHatchLines(lines, 20, islands)

    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) {
        const crossesGap =
          Math.min(chain[i - 1].x, chain[i].x) < 10 &&
          Math.max(chain[i - 1].x, chain[i].x) > 15
        expect(crossesGap).toBe(false)
      }
    }
    // 島ごとに1本ずつ、計2本の一筆書きにまとまる
    expect(chains.length).toBe(2)
  })

  it('細い穴(スリット)を持つ形状で、穴の幅より大きい許容距離でも穴を横切る接続線は引かれない', () => {
    const outer: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ]
    // 幅2mmの縦スリット。同じ行の左右セグメントの端点同士が2mmしか離れていないため、
    // 距離判定だけならスリットを横切って連結されてしまう
    const hole: Point[] = [
      { x: 19, y: 10 },
      { x: 19, y: 30 },
      { x: 21, y: 30 },
      { x: 21, y: 10 },
    ]
    const paths = [outer, hole]
    const lines = generateHatchLines(paths, 0, 5)
    const chains = connectHatchLines(lines, 5, paths)

    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) {
        const mid = {
          x: (chain[i - 1].x + chain[i].x) / 2,
          y: (chain[i - 1].y + chain[i].y) / 2,
        }
        const insideHole = mid.x > 19 && mid.x < 21 && mid.y > 10 && mid.y < 30
        expect(insideHole).toBe(false)
      }
    }
  })

  it('凹形状(L字)で、凹み部分を横切るショートカット接続は引かれない', () => {
    const lShape: Point[][] = [
      [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 30 },
        { x: 0, y: 30 },
      ],
    ]
    const lines = generateHatchLines(lShape, 0, 2)
    // 下部(幅30mm)から上部(幅10mm)へ移る際の接続は約20mmで、許容距離25mm以内に収まるが、
    // 直線で結ぶとL字の欠けている領域を横切ってしまう
    const chains = connectHatchLines(lines, 25, lShape)

    // L字の欠けている領域(x>10 かつ y>10)を通る線分がないこと。
    // 凹み部分をかすめる接続は中点が境界上に来ることがあるため、線分上を等間隔にサンプルする
    const samples = 20
    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) {
        for (let s = 1; s < samples; s++) {
          const t = s / samples
          const x = chain[i - 1].x + (chain[i].x - chain[i - 1].x) * t
          const y = chain[i - 1].y + (chain[i].y - chain[i - 1].y) * t
          expect(x > 10 && y > 10).toBe(false)
        }
      }
    }
  })
})
