import type { Point } from '../types/geometry'

/** 輪郭(始点≠終点)を、始点に戻って閉じた描画用のループにする */
export function closeLoop(contour: Point[]): Point[] {
  return [...contour, contour[0]]
}

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * 点群の軸平行バウンディングボックス。
 * Math.min(...points)のスプレッドは点数が多いとスタックを溢れさせるためループで求める。
 */
export function boundsOfPoints(points: Point[]): Bounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, maxX, minY, maxY }
}
