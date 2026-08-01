import type { Point } from './types'

export interface CubicSegment {
  c1: Point
  c2: Point
  point: Point
}

function unitVectorAngle(
  ux: number,
  uy: number,
  vx: number,
  vy: number,
): number {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1
  let dot = ux * vx + uy * vy
  if (dot > 1) dot = 1
  if (dot < -1) dot = -1
  return sign * Math.acos(dot)
}

function getArcCenter(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  largeArcFlag: number,
  sweepFlag: number,
  rx: number,
  ry: number,
  sinPhi: number,
  cosPhi: number,
): { cx: number; cy: number; theta1: number; deltaTheta: number } {
  const x1p = (cosPhi * (x1 - x2)) / 2 + (sinPhi * (y1 - y2)) / 2
  const y1p = (-sinPhi * (x1 - x2)) / 2 + (cosPhi * (y1 - y2)) / 2

  const rxSq = rx * rx
  const rySq = ry * ry
  const x1pSq = x1p * x1p
  const y1pSq = y1p * y1p

  let radicant = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq
  radicant = Math.max(radicant, 0) / (rxSq * y1pSq + rySq * x1pSq)
  const coef = Math.sqrt(radicant) * (largeArcFlag === sweepFlag ? -1 : 1)

  const cxp = ((coef * rx) / ry) * y1p
  const cyp = ((coef * -ry) / rx) * x1p

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2

  const v1x = (x1p - cxp) / rx
  const v1y = (y1p - cyp) / ry
  const v2x = (-x1p - cxp) / rx
  const v2y = (-y1p - cyp) / ry

  const theta1 = unitVectorAngle(1, 0, v1x, v1y)
  let deltaTheta = unitVectorAngle(v1x, v1y, v2x, v2y)

  if (sweepFlag === 0 && deltaTheta > 0) deltaTheta -= 2 * Math.PI
  if (sweepFlag === 1 && deltaTheta < 0) deltaTheta += 2 * Math.PI

  return { cx, cy, theta1, deltaTheta }
}

function approxUnitArcAsCubic(theta1: number, deltaTheta: number) {
  const alpha = (4 / 3) * Math.tan(deltaTheta / 4)
  const x1 = Math.cos(theta1)
  const y1 = Math.sin(theta1)
  const x2 = Math.cos(theta1 + deltaTheta)
  const y2 = Math.sin(theta1 + deltaTheta)
  return {
    c1x: x1 - y1 * alpha,
    c1y: y1 + x1 * alpha,
    c2x: x2 + y2 * alpha,
    c2y: y2 - x2 * alpha,
    x2,
    y2,
  }
}

/**
 * SVGパスのA(楕円弧)コマンドを3次ベジェ曲線列へ変換する(標準的なendpoint→center parameterization)。
 * rxまたはryが0の場合は直線として扱う(単一の退化した"ベジェ"を返す)。
 */
export function arcToCubicSegments(
  from: Point,
  to: Point,
  rxIn: number,
  ryIn: number,
  xAxisRotationDeg: number,
  largeArcFlag: number,
  sweepFlag: number,
): CubicSegment[] {
  if (from.x === to.x && from.y === to.y) return []

  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (rx === 0 || ry === 0) {
    return [{ c1: from, c2: to, point: to }]
  }

  const phi = ((xAxisRotationDeg % 360) * Math.PI) / 180
  const sinPhi = Math.sin(phi)
  const cosPhi = Math.cos(phi)

  const x1p = (cosPhi * (from.x - to.x)) / 2 + (sinPhi * (from.y - to.y)) / 2
  const y1p = (-sinPhi * (from.x - to.x)) / 2 + (cosPhi * (from.y - to.y)) / 2

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }

  const { cx, cy, theta1, deltaTheta } = getArcCenter(
    from.x,
    from.y,
    to.x,
    to.y,
    largeArcFlag,
    sweepFlag,
    rx,
    ry,
    sinPhi,
    cosPhi,
  )

  const segmentCount = Math.max(
    Math.ceil(Math.abs(deltaTheta) / (Math.PI / 2)),
    1,
  )
  const delta = deltaTheta / segmentCount

  const segments: CubicSegment[] = []
  for (let i = 0; i < segmentCount; i++) {
    const unit = approxUnitArcAsCubic(theta1 + i * delta, delta)
    const toWorld = (ux: number, uy: number): Point => ({
      x: ux * rx * cosPhi - uy * ry * sinPhi + cx,
      y: ux * rx * sinPhi + uy * ry * cosPhi + cy,
    })
    segments.push({
      c1: toWorld(unit.c1x, unit.c1y),
      c2: toWorld(unit.c2x, unit.c2y),
      point: toWorld(unit.x2, unit.y2),
    })
  }
  if (segments.length > 0) {
    segments[segments.length - 1].point = to
  }
  return segments
}
