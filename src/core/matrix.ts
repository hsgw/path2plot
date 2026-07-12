import type { Matrix2D, Point } from '../types/geometry'

export function identity(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
}

/** m1∘m2 (m2を先に適用してからm1を適用する合成行列)を返す */
export function multiply(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  }
}

export function apply(m: Matrix2D, p: Point): Point {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  }
}

export function translate(tx: number, ty: number): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }
}

export function scale(sx: number, sy: number): Matrix2D {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
}

export function rotateDeg(deg: number): Matrix2D {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

export function skewXDeg(deg: number): Matrix2D {
  const rad = (deg * Math.PI) / 180
  return { a: 1, b: 0, c: Math.tan(rad), d: 1, e: 0, f: 0 }
}

export function skewYDeg(deg: number): Matrix2D {
  const rad = (deg * Math.PI) / 180
  return { a: 1, b: Math.tan(rad), c: 0, d: 1, e: 0, f: 0 }
}
