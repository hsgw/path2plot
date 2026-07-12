import type { Point } from '../types/geometry'
import type { PathCommand } from './pathCommand'

/** 真円近似に使う4分割ベジェの制御点係数(誤差0.03%程度の標準定数) */
const KAPPA = 0.5522847498307936

export function rectToCommands(
  x: number,
  y: number,
  width: number,
  height: number,
): PathCommand[] {
  return [
    { type: 'M', point: { x, y } },
    { type: 'L', point: { x: x + width, y } },
    { type: 'L', point: { x: x + width, y: y + height } },
    { type: 'L', point: { x, y: y + height } },
    { type: 'Z' },
  ]
}

export function ellipseToCommands(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): PathCommand[] {
  const ox = rx * KAPPA
  const oy = ry * KAPPA
  const top: Point = { x: cx, y: cy - ry }
  const right: Point = { x: cx + rx, y: cy }
  const bottom: Point = { x: cx, y: cy + ry }
  const left: Point = { x: cx - rx, y: cy }

  return [
    { type: 'M', point: top },
    {
      type: 'C',
      c1: { x: top.x + ox, y: top.y },
      c2: { x: right.x, y: right.y - oy },
      point: right,
    },
    {
      type: 'C',
      c1: { x: right.x, y: right.y + oy },
      c2: { x: bottom.x + ox, y: bottom.y },
      point: bottom,
    },
    {
      type: 'C',
      c1: { x: bottom.x - ox, y: bottom.y },
      c2: { x: left.x, y: left.y + oy },
      point: left,
    },
    {
      type: 'C',
      c1: { x: left.x, y: left.y - oy },
      c2: { x: top.x - ox, y: top.y },
      point: top,
    },
    { type: 'Z' },
  ]
}

export function circleToCommands(
  cx: number,
  cy: number,
  r: number,
): PathCommand[] {
  return ellipseToCommands(cx, cy, r, r)
}

export function lineToCommands(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): PathCommand[] {
  return [
    { type: 'M', point: { x: x1, y: y1 } },
    { type: 'L', point: { x: x2, y: y2 } },
  ]
}

function parsePointsAttr(pointsStr: string): Point[] {
  const numbers = (pointsStr.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? []).map(
    Number,
  )
  const points: Point[] = []
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] })
  }
  return points
}

export function polylineToCommands(
  pointsAttr: string,
  close: boolean,
): PathCommand[] {
  const points = parsePointsAttr(pointsAttr)
  if (points.length === 0) return []

  const commands: PathCommand[] = [{ type: 'M', point: points[0] }]
  for (let i = 1; i < points.length; i++) {
    commands.push({ type: 'L', point: points[i] })
  }
  if (close) commands.push({ type: 'Z' })
  return commands
}
