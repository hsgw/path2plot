export interface Point {
  x: number
  y: number
}

/** 2x3のアフィン変換行列 [[a c e][b d f][0 0 1]] */
export interface Matrix2D {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface ViewBox {
  minX: number
  minY: number
  width: number
  height: number
}
