import { describe, expect, it } from 'vitest'
import type { Point } from '../types/geometry'
import { createContourTracer, traceAlongContour } from './contourTrace'

/** 反時計回りの10x10正方形。頂点は (0,0)(10,0)(10,10)(0,10) */
const SQUARE: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

describe('traceAlongContour(往復モードの輪郭なぞり)', () => {
  it('同じ辺の上にある2点は中間頂点を持たない(直線で繋げる)', () => {
    const a = { x: 2, y: 0 }
    const b = { x: 7, y: 0 }
    expect(traceAlongContour(a, b, [SQUARE])!.vertices).toEqual([])
  })

  it('角をまたぐ2点はその角の頂点を返す', () => {
    const a = { x: 8, y: 0 } // 下辺
    const b = { x: 10, y: 3 } // 右辺
    expect(traceAlongContour(a, b, [SQUARE])!.vertices).toEqual([
      { x: 10, y: 0 },
    ])
  })

  it('逆向き(インデックス減少方向)でも角の頂点を返す', () => {
    const a = { x: 10, y: 3 }
    const b = { x: 8, y: 0 }
    expect(traceAlongContour(a, b, [SQUARE])!.vertices).toEqual([
      { x: 10, y: 0 },
    ])
  })

  it('2つの角をまたぐ場合は通過する頂点を順に返す', () => {
    const a = { x: 8, y: 0 } // 下辺
    const b = { x: 8, y: 10 } // 上辺
    expect(traceAlongContour(a, b, [SQUARE])!.vertices).toEqual([
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
  })

  it('短い方の弧を選ぶ(長い方を回り込まない)', () => {
    // 下辺の右寄りと上辺の右寄り。右回り(2頂点)の方が左回り(2頂点)より短い
    const a = { x: 9, y: 0 }
    const b = { x: 9, y: 10 }
    const traced = traceAlongContour(a, b, [SQUARE])!.vertices
    // 右回り: (10,0)→(10,10) を通る。左回りなら (0,0)→(0,10) を通る
    expect(traced.every((p) => p.x === 10)).toBe(true)

    const a2 = { x: 1, y: 0 }
    const b2 = { x: 1, y: 10 }
    const traced2 = traceAlongContour(a2, b2, [SQUARE])!.vertices
    expect(traced2.every((p) => p.x === 0)).toBe(true)
  })

  it('なぞった経路の全ての点が輪郭上に乗っている', () => {
    const a = { x: 3, y: 0 }
    const b = { x: 0, y: 4 }
    const traced = traceAlongContour(a, b, [SQUARE])!.vertices
    for (const p of traced) {
      const onEdge = p.x === 0 || p.x === 10 || p.y === 0 || p.y === 10
      expect(onEdge).toBe(true)
    }
  })

  it('別のループ上の点同士はnull(穴の境界と外形をまたぐ場合)', () => {
    const hole: Point[] = [
      { x: 3, y: 3 },
      { x: 3, y: 7 },
      { x: 7, y: 7 },
      { x: 7, y: 3 },
    ]
    const onOuter = { x: 5, y: 0 }
    const onHole = { x: 5, y: 3 }
    expect(traceAlongContour(onOuter, onHole, [SQUARE, hole])).toBeNull()
  })

  it('輪郭が空ならnull', () => {
    expect(traceAlongContour({ x: 0, y: 0 }, { x: 1, y: 1 }, [])).toBeNull()
  })

  it('なぞる距離(length)を返す', () => {
    const traced = traceAlongContour({ x: 8, y: 0 }, { x: 10, y: 3 }, [SQUARE])!
    // (8,0)→(10,0)→(10,3) で 2 + 3 = 5
    expect(traced.length).toBeCloseTo(5, 5)
  })
})

describe('createContourTracer(なぞり区間の重複防止)', () => {
  /** okを期待して経路を取り出し、そのままcommitする */
  function traceAndCommit(
    tracer: ReturnType<typeof createContourTracer>,
    a: Point,
    b: Point,
  ) {
    const result = tracer.trace(a, b)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    tracer.commit(result.path)
    return result.path
  }

  it('一度なぞった区間は二度なぞらない', () => {
    const tracer = createContourTracer([SQUARE])
    const first = traceAndCommit(tracer, { x: 2, y: 0 }, { x: 8, y: 0 })
    expect(first.vertices).toEqual([])

    // 完全に含まれる区間
    expect(tracer.trace({ x: 3, y: 0 }, { x: 7, y: 0 }).status).toBe('overlap')
    // 一部だけ重なる区間
    expect(tracer.trace({ x: 7, y: 0 }, { x: 9, y: 0 }).status).toBe('overlap')
    // 逆向きでも同じ区間なので拒否される
    expect(tracer.trace({ x: 8, y: 0 }, { x: 2, y: 0 }).status).toBe('overlap')
  })

  it('重ならない区間は通す。端点で接するだけなら重なりとみなさない', () => {
    const tracer = createContourTracer([SQUARE])
    traceAndCommit(tracer, { x: 2, y: 0 }, { x: 5, y: 0 })
    traceAndCommit(tracer, { x: 5, y: 0 }, { x: 8, y: 0 })
    // 別の辺は無関係
    expect(tracer.trace({ x: 10, y: 2 }, { x: 10, y: 6 }).status).toBe('ok')
  })

  it('別のループの区間は互いに干渉しない', () => {
    const hole: Point[] = [
      { x: 3, y: 3 },
      { x: 3, y: 7 },
      { x: 7, y: 7 },
      { x: 7, y: 3 },
    ]
    const tracer = createContourTracer([SQUARE, hole])
    traceAndCommit(tracer, { x: 3, y: 4 }, { x: 3, y: 6 })
    // 外形側の同じような位置は影響を受けない
    expect(tracer.trace({ x: 0, y: 4 }, { x: 0, y: 6 }).status).toBe('ok')
  })

  it('別のループ上の2点はunreachable(直線での代替は呼び出し側の判断)', () => {
    const hole: Point[] = [
      { x: 3, y: 3 },
      { x: 3, y: 7 },
      { x: 7, y: 7 },
      { x: 7, y: 3 },
    ]
    const tracer = createContourTracer([SQUARE, hole])
    expect(tracer.trace({ x: 5, y: 0 }, { x: 5, y: 3 }).status).toBe(
      'unreachable',
    )
  })
})
