import { describe, expect, it } from 'vitest'
import type { Point } from '../types/geometry'
import type { HatchParams } from './hatchGenerate'
import { flattenHatchRows, generateHatchLines } from './hatchGenerate'
import {
  connectHatchRowsBoustrophedon,
  connectHatchRowsZigzag,
  orderHatchLinesAsChains,
  orderHatchLinesByNearestNeighbor,
} from './hatchConnect'
import { distSqToSegment, isSegmentInsidePolygon } from './polygonContain'

/** テスト既定の接続距離の上限(線間隔1mm × 既定倍率3) */
const CONNECT_LIMIT = 3

const SQUARE_10: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

/** 40x40の外形に、逆巻き(CW)の穴を持つドーナツ */
const DONUT_OUTER: Point[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
]
const DONUT_HOLE: Point[] = [
  { x: 15, y: 10 },
  { x: 15, y: 30 },
  { x: 25, y: 30 },
  { x: 25, y: 10 },
]

function params(overrides: Partial<HatchParams> = {}): HatchParams {
  return {
    angleDeg: 0,
    spacingMm: 1,
    waveform: 'straight',
    waveAmplitudeMm: 0,
    waveLengthMm: 2,
    waveSegmentsPerCycle: 8,
    ...overrides,
  }
}

function rowsFor(
  paths: Point[][],
  overrides: Partial<HatchParams> = {},
): ReturnType<typeof generateHatchLines> {
  return generateHatchLines(paths, params(overrides))
}

describe('connectHatchRowsZigzag(FR-18: ジグザグ)', () => {
  it('矩形はL0→R1→L2→R3…と各行の左右の端点を交互に拾った1本になる', () => {
    const rows = rowsFor([SQUARE_10])
    const [chain, ...rest] = connectHatchRowsZigzag(rows, [SQUARE_10])
    expect(rest).toEqual([])
    // 10行それぞれから1点ずつ
    expect(chain.length).toBe(10)
    for (const [i, p] of chain.entries()) {
      expect(p.y).toBeCloseTo(0.5 + i, 2)
      expect(p.x).toBeCloseTo(i % 2 === 0 ? 0 : 10, 2)
    }
  })

  it('ハッチ線そのものは描かれない(1行あたり2点にはならない)', () => {
    const rows = rowsFor([SQUARE_10])
    const zigzag = connectHatchRowsZigzag(rows, [SQUARE_10])
    const totalPoints = zigzag.reduce((sum, c) => sum + c.length, 0)
    // ハッチ線をそのまま描くと 10行 × 2点 = 20点になるが、ジグザグは各行1点しか使わない
    expect(totalPoints).toBe(10)
  })

  it('ドーナツでは穴の左右がそれぞれ別の柱として両方描かれる(描き残しがない)', () => {
    const paths = [DONUT_OUTER, DONUT_HOLE]
    const rows = rowsFor(paths, { spacingMm: 2 })
    const chains = connectHatchRowsZigzag(rows, paths)

    // 穴の左側(x<15)・右側(x>25)を通る点がどちらも存在する
    const allPoints = chains.flat()
    expect(allPoints.some((p) => p.x < 15)).toBe(true)
    expect(allPoints.some((p) => p.x > 25)).toBe(true)

    // 穴の内部(15<x<25 かつ 10<y<30)を通る点は1つもない
    for (const p of allPoints) {
      const insideHole =
        p.x > 15.01 && p.x < 24.99 && p.y > 10.01 && p.y < 29.99
      expect(insideHole).toBe(false)
    }

    // 穴の高さの範囲にある全ての行が、左右どちらの柱にも代表点を持つ
    const rowsInHole = rows.filter((r) => r.segments.length === 2)
    expect(rowsInHole.length).toBeGreaterThan(0)
    for (const row of rowsInHole) {
      const y = row.segments[0].points[0].y
      const atY = allPoints.filter((p) => Math.abs(p.y - y) < 0.01)
      expect(atY.length).toBe(2)
    }
  })

  it('接続線が塗り領域の外へ出る位置ではチェーンを分ける', () => {
    // 離れた2つの島。柱が分かれるため、島をまたぐ斜め線は引かれない
    const left: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const right: Point[] = [
      { x: 30, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 10 },
      { x: 30, y: 10 },
    ]
    const paths = [left, right]
    const chains = connectHatchRowsZigzag(
      rowsFor(paths, { spacingMm: 2 }),
      paths,
    )
    expect(chains.length).toBe(2)
    for (const chain of chains) {
      const xs = chain.map((p) => p.x)
      const spansGap = Math.min(...xs) < 15 && Math.max(...xs) > 25
      expect(spansGap).toBe(false)
    }
  })

  it('L字の凹み部分を斜めに横切る接続線を引かない', () => {
    // 下半分が幅40、上半分が幅10のL字(左寄せ)
    const lShape: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 40 },
      { x: 0, y: 40 },
    ]
    const chains = connectHatchRowsZigzag(rowsFor([lShape], { spacingMm: 2 }), [
      lShape,
    ])
    // 引かれた全ての線分が形状の内側に収まっている(凹みを横切らない)
    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) {
        const mid = {
          x: (chain[i - 1].x + chain[i].x) / 2,
          y: (chain[i - 1].y + chain[i].y) / 2,
        }
        const inside = mid.y <= 10.01 || mid.x <= 10.01
        expect(inside).toBe(true)
      }
    }
  })

  it('柱が1行しかない場合はその断片自体を1本の線として出力する(描き残しを避ける)', () => {
    // 高さが1行分しかない細い帯
    const thin: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 1.2 },
      { x: 0, y: 1.2 },
    ]
    const chains = connectHatchRowsZigzag(rowsFor([thin]), [thin])
    expect(chains.length).toBe(1)
    expect(chains[0].length).toBe(2)
    expect(chains[0][0].x).toBeCloseTo(0, 2)
    expect(chains[0][1].x).toBeCloseTo(10, 2)
  })

  it('入力の配列を破壊的に変更しない', () => {
    const rows = rowsFor([SQUARE_10])
    const before = JSON.stringify(rows)
    connectHatchRowsZigzag(rows, [SQUARE_10])
    expect(JSON.stringify(rows)).toBe(before)
  })
})

describe('connectHatchRowsBoustrophedon(FR-18: 往復・牛耕式)', () => {
  it('行番号昇順に向きを交互に反転しながら1本につながる', () => {
    // 矩形の左右の辺はハッチ線と直交するため、接続には中間頂点が入らない
    const rows = rowsFor([SQUARE_10])
    const [chain, ...rest] = connectHatchRowsBoustrophedon(
      rows,
      [SQUARE_10],
      CONNECT_LIMIT,
    )
    expect(rest).toEqual([])
    // 10行 × 2点
    expect(chain.length).toBe(20)
    for (let i = 0; i < 10; i++) {
      const a = chain[i * 2]
      const b = chain[i * 2 + 1]
      expect(a.y).toBeCloseTo(0.5 + i, 2)
      expect(b.y).toBeCloseTo(0.5 + i, 2)
      // 偶数行は左→右、奇数行は右→左
      expect(a.x).toBeCloseTo(i % 2 === 0 ? 0 : 10, 2)
      expect(b.x).toBeCloseTo(i % 2 === 0 ? 10 : 0, 2)
    }
  })

  it('接続部は輪郭をなぞる(角をまたぐ場合は輪郭の頂点が挟まる)', () => {
    // 45°ハッチなら端点は矩形の各辺を渡り歩くため、角の頂点が接続部に現れる
    const rows = rowsFor([SQUARE_10], { angleDeg: 45, spacingMm: 2 })
    const chains = connectHatchRowsBoustrophedon(
      rows,
      [SQUARE_10],
      CONNECT_LIMIT,
    )
    const corners = SQUARE_10.map((p) => `${p.x},${p.y}`)
    const used = chains.flat().filter((p) => corners.includes(`${p.x},${p.y}`))
    expect(used.length).toBeGreaterThan(0)
  })

  it('45°の矩形でも(距離のしきい値なしで)1本にまとまる', () => {
    const rows = rowsFor([SQUARE_10], { angleDeg: 45, spacingMm: 1 })
    expect(
      connectHatchRowsBoustrophedon(rows, [SQUARE_10], CONNECT_LIMIT).length,
    ).toBe(1)
  })

  it('全ての描画線分が塗り領域内に収まる(輪郭上も含む)', () => {
    const rows = rowsFor([SQUARE_10], { angleDeg: 45, spacingMm: 1 })
    for (const chain of connectHatchRowsBoustrophedon(
      rows,
      [SQUARE_10],
      CONNECT_LIMIT,
    )) {
      for (let i = 1; i < chain.length; i++) {
        expect(
          isSegmentInsidePolygon(chain[i - 1], chain[i], [SQUARE_10]),
        ).toBe(true)
      }
    }
  })

  it('穴をまたぐ接続は行わない', () => {
    const paths = [DONUT_OUTER, DONUT_HOLE]
    const rows = rowsFor(paths, { spacingMm: 2 })
    const chains = connectHatchRowsBoustrophedon(rows, paths, CONNECT_LIMIT)
    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) {
        const mid = {
          x: (chain[i - 1].x + chain[i].x) / 2,
          y: (chain[i - 1].y + chain[i].y) / 2,
        }
        const insideHole =
          mid.x > 15.01 && mid.x < 24.99 && mid.y > 10.01 && mid.y < 29.99
        expect(insideHole).toBe(false)
      }
    }
  })

  it('離れた2つの島をまたぐ接続は行わない', () => {
    const left: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const right: Point[] = [
      { x: 30, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 10 },
      { x: 30, y: 10 },
    ]
    const paths = [left, right]
    const chains = connectHatchRowsBoustrophedon(
      rowsFor(paths, { spacingMm: 2 }),
      paths,
      CONNECT_LIMIT,
    )
    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) {
        const midX = (chain[i - 1].x + chain[i].x) / 2
        expect(midX > 10.01 && midX < 29.99).toBe(false)
      }
    }
  })

  it('入力の配列を破壊的に変更しない', () => {
    const rows = rowsFor([SQUARE_10])
    const before = JSON.stringify(rows)
    connectHatchRowsBoustrophedon(rows, [SQUARE_10], CONNECT_LIMIT)
    expect(JSON.stringify(rows)).toBe(before)
  })

  it('描かれる線はハッチ線か輪郭上のなぞりだけで、塗りの内部を横切る直線を引かない', () => {
    // 複数ループを持つ形状。輪郭を辿れない位置で直線代替をしていた頃は、塗り領域の内側では
    // あるがハッチとも輪郭とも無関係な角度の線が引かれていた
    const outer: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ]
    const holeA: Point[] = [
      { x: 8, y: 8 },
      { x: 8, y: 18 },
      { x: 18, y: 18 },
      { x: 18, y: 8 },
    ]
    const holeB: Point[] = [
      { x: 24, y: 24 },
      { x: 24, y: 34 },
      { x: 34, y: 34 },
      { x: 34, y: 24 },
    ]
    const paths = [outer, holeA, holeB]

    const rows = rowsFor(paths, { spacingMm: 2 })
    const hatchPairs = new Set<string>()
    for (const row of rows) {
      for (const s of row.segments) {
        const a = s.points[0]
        const b = s.points.at(-1)!
        hatchPairs.add(`${a.x},${a.y}|${b.x},${b.y}`)
        hatchPairs.add(`${b.x},${b.y}|${a.x},${a.y}`)
      }
    }
    const edges = paths.flatMap((loop) =>
      loop.map((p, i) => [p, loop[(i + 1) % loop.length]] as const),
    )
    const onContour = (p: Point): boolean =>
      edges.some(([e0, e1]) => distSqToSegment(p, e0, e1) <= 1e-6)

    let checked = 0
    for (const chain of connectHatchRowsBoustrophedon(
      rows,
      paths,
      CONNECT_LIMIT,
    )) {
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1]
        const b = chain[i]
        if (hatchPairs.has(`${a.x},${a.y}|${b.x},${b.y}`)) continue
        checked++
        // ハッチ線でないなら、その中点は必ず輪郭の上に乗っている
        expect(onContour({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })).toBe(true)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('ジグザグは離れた断片へ繋がない(横断線の防止)', () => {
  /** 外接半径20・内接半径8の5芒星。単一の凹形状なので、腕から腕へ引いた線も「内側」になる */
  const STAR: Point[] = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 20 : 8
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    return { x: 25 + r * Math.cos(a), y: 25 + r * Math.sin(a) }
  })

  /** 断片の端点座標から、その断片の行番号・回転空間のx範囲を引けるようにする */
  function fragmentIndex(rows: ReturnType<typeof generateHatchLines>) {
    const byPoint = new Map<
      string,
      { row: number; xStart: number; xEnd: number }
    >()
    for (const row of rows) {
      for (const s of row.segments) {
        const info = { row: row.rowIndex, xStart: s.xStart, xEnd: s.xEnd }
        for (const p of [s.points[0], s.points.at(-1)!]) {
          byPoint.set(`${p.x.toFixed(4)},${p.y.toFixed(4)}`, info)
        }
      }
    }
    return (p: Point) => byPoint.get(`${p.x.toFixed(4)},${p.y.toFixed(4)}`)
  }

  it('星形で腕から腕へ胴体を横切る接続を引かない', () => {
    for (const angleDeg of [0, 30, 45, 90]) {
      const rows = rowsFor([STAR], { angleDeg, spacingMm: 2 })
      const lookup = fragmentIndex(rows)
      const chains = connectHatchRowsZigzag(rows, [STAR])

      let checked = 0
      for (const chain of chains) {
        for (let i = 1; i < chain.length; i++) {
          const a = lookup(chain[i - 1])
          const b = lookup(chain[i])
          if (!a || !b) continue
          // 同一の断片を指すなら、それは接続ではなく断片自体(柱が1行のときの救済出力)
          if (a === b) continue
          checked++
          // 1行だけ進んでいる
          expect(Math.abs(b.row - a.row)).toBe(1)
          // 回転空間のx範囲が重なっている
          expect(
            Math.min(a.xEnd, b.xEnd) - Math.max(a.xStart, b.xStart),
          ).toBeGreaterThan(0)
        }
      }
      expect(checked).toBeGreaterThan(0)
    }
  })

  it('全ての断片がちょうど1回ずつ描かれる(横断線を消しても描き残さない)', () => {
    const rows = rowsFor([STAR], { angleDeg: 45, spacingMm: 2 })
    const fragments = rows.reduce((s, r) => s + r.segments.length, 0)
    const chains = connectHatchRowsZigzag(rows, [STAR])
    const points = chains.reduce((s, c) => s + c.length, 0)
    // 1断片=1点。1点だけのチェーンは断片自体(2点)として出力されるため上限は2倍
    expect(points).toBeGreaterThanOrEqual(fragments)
    expect(points).toBeLessThanOrEqual(fragments * 2)
  })

  it('単純な矩形では正常な一歩を削らない(1本のまま)', () => {
    const rows = rowsFor([SQUARE_10])
    const chains = connectHatchRowsZigzag(rows, [SQUARE_10])
    expect(chains.length).toBe(1)
    expect(chains[0].length).toBe(10)
  })
})

describe('標準順で繋げないときのフォールバック探索', () => {
  // 下が幅40、上が幅10のL字。幅が変わる境目で行内の断片数・位置が大きく動く
  const L_SHAPE: Point[] = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 40 },
    { x: 0, y: 40 },
  ]
  // 上部が2本の柱に分かれ、下部で1本に合流するU字
  const U_SHAPE: Point[] = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 30, y: 40 },
    { x: 30, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 40 },
    { x: 0, y: 40 },
  ]

  it('往復: 標準順で繋げない位置でも最寄りの断片を探して繋ぎ続ける', () => {
    for (const shape of [L_SHAPE, U_SHAPE]) {
      const rows = rowsFor([shape], { spacingMm: 2 })
      const chains = connectHatchRowsBoustrophedon(rows, [shape], CONNECT_LIMIT)
      // 断片数よりチェーン数が十分少ない(=大半が繋がっている)
      const fragments = rows.reduce((s, r) => s + r.segments.length, 0)
      expect(chains.length).toBeLessThan(fragments / 2)
      // 繋いだ結果もはみ出していない
      for (const chain of chains) {
        for (let i = 1; i < chain.length; i++) {
          expect(isSegmentInsidePolygon(chain[i - 1], chain[i], [shape])).toBe(
            true,
          )
        }
      }
    }
  })

  it('ジグザグ: 柱が切り替わる位置でも最寄りの断片へ繋ぎ続ける', () => {
    const rows = rowsFor([U_SHAPE], { spacingMm: 2 })
    const chains = connectHatchRowsZigzag(rows, [U_SHAPE])
    // 柱は3本(左の柱・右の柱・下の合流部)だが、フォールバックでより少ない本数にまとまる
    expect(chains.length).toBeLessThanOrEqual(3)
    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) {
        expect(isSegmentInsidePolygon(chain[i - 1], chain[i], [U_SHAPE])).toBe(
          true,
        )
      }
    }
  })

  it('ジグザグは常に反対側の端点へ繋ぐ(同じ側へは繋がない)', () => {
    for (const shape of [L_SHAPE, U_SHAPE, SQUARE_10]) {
      const rows = rowsFor([shape], { spacingMm: 2 })
      // 各断片の左端・右端の座標を集め、チェーン内で左右が交互になっていることを確かめる
      const lefts = new Set<string>()
      const rights = new Set<string>()
      for (const row of rows) {
        for (const s of row.segments) {
          lefts.add(`${s.points[0].x},${s.points[0].y}`)
          rights.add(`${s.points.at(-1)!.x},${s.points.at(-1)!.y}`)
        }
      }
      for (const chain of connectHatchRowsZigzag(rows, [shape])) {
        if (chain.length < 2) continue
        const sides = chain.map((p) => {
          const key = `${p.x},${p.y}`
          if (lefts.has(key) && !rights.has(key)) return 'left'
          if (rights.has(key) && !lefts.has(key)) return 'right'
          return null // 左右どちらとも判別できない点は判定から外す
        })
        for (let i = 1; i < sides.length; i++) {
          if (sides[i] && sides[i - 1]) expect(sides[i]).not.toBe(sides[i - 1])
        }
      }
    }
  })

  it('往復は同じ輪郭区間を二度なぞらない', () => {
    const rows = rowsFor([SQUARE_10], { angleDeg: 45, spacingMm: 1 })
    const chains = connectHatchRowsBoustrophedon(
      rows,
      [SQUARE_10],
      CONNECT_LIMIT,
    )
    // ハッチ線の端点ではない点(=なぞりで挟まった輪郭頂点)が重複して現れない
    const cornerKeys = SQUARE_10.map((p) => `${p.x},${p.y}`)
    const seen = chains
      .flat()
      .map((p) => `${p.x},${p.y}`)
      .filter((k) => cornerKeys.includes(k))
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('全ての断片がちょうど1回ずつ使われる(描き残し・重複がない)', () => {
    const rows = rowsFor([U_SHAPE], { spacingMm: 2 })
    const fragments = rows.reduce((s, r) => s + r.segments.length, 0)
    const zigzagPoints = connectHatchRowsZigzag(rows, [U_SHAPE]).reduce(
      (s, c) => s + c.length,
      0,
    )
    // ジグザグは1断片=1点(1点だけのチェーンは断片自体を出力するので2点になる)
    expect(zigzagPoints).toBeGreaterThanOrEqual(fragments)
    expect(zigzagPoints).toBeLessThanOrEqual(fragments * 2)
  })
})

describe('orderHatchLinesByNearestNeighbor(connect==="none"用の順序最適化)', () => {
  it('現在位置に近い方の端点を採用し、終点が近ければ逆向きで訪れる', () => {
    const lines: Point[][] = [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      // 始点(0,1)より終点(10,1)の方が直前の末尾(10,0)に近い
      [
        { x: 0, y: 1 },
        { x: 10, y: 1 },
      ],
    ]
    const ordered = orderHatchLinesByNearestNeighbor(lines)
    expect(ordered.map((o) => o.reversed)).toEqual([false, true])
  })

  it('orderHatchLinesAsChainsは反転を反映した個別チェーンを返す', () => {
    const lines: Point[][] = [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 0, y: 1 },
        { x: 10, y: 1 },
      ],
    ]
    const chains = orderHatchLinesAsChains(lines)
    expect(chains.length).toBe(2)
    expect(chains[1][0]).toEqual({ x: 10, y: 1 })
    // 入力を破壊していない
    expect(lines[1][0]).toEqual({ x: 0, y: 1 })
  })

  it('全ハッチ線が個別チェーンとして保持される', () => {
    const rows = rowsFor([SQUARE_10])
    const chains = orderHatchLinesAsChains(flattenHatchRows(rows))
    expect(chains.length).toBe(10)
  })
})
