import type { Matrix2D } from '../geometry/types'
import {
  identity,
  multiply,
  rotateDeg,
  scale,
  skewXDeg,
  skewYDeg,
  translate,
} from '../geometry/matrix'

const FUNCTION_RE = /(\w+)\s*\(([^)]*)\)/g

function parseArgs(argsStr: string): number[] {
  return argsStr
    .trim()
    .split(/[\s,]+/)
    .filter((s) => s.length > 0)
    .map(Number)
}

function functionToMatrix(name: string, args: number[]): Matrix2D {
  switch (name) {
    case 'translate': {
      const [tx, ty = 0] = args
      return translate(tx, ty)
    }
    case 'scale': {
      const [sx, sy = sx] = args
      return scale(sx, sy)
    }
    case 'rotate': {
      const [deg, cx, cy] = args
      if (cx !== undefined && cy !== undefined) {
        return multiply(
          multiply(translate(cx, cy), rotateDeg(deg)),
          translate(-cx, -cy),
        )
      }
      return rotateDeg(deg)
    }
    case 'skewX': {
      const [deg] = args
      return skewXDeg(deg)
    }
    case 'skewY': {
      const [deg] = args
      return skewYDeg(deg)
    }
    case 'matrix': {
      const [a, b, c, d, e, f] = args
      return { a, b, c, d, e, f }
    }
    default:
      return identity()
  }
}

/** SVGのtransform属性文字列を合成済みの単一Matrix2Dへ変換する */
export function parseTransformAttr(value: string | null | undefined): Matrix2D {
  if (!value) return identity()

  let combined = identity()
  for (const match of value.matchAll(FUNCTION_RE)) {
    const name = match[1]
    const args = parseArgs(match[2])
    combined = multiply(combined, functionToMatrix(name, args))
  }
  return combined
}
