import { describe, expect, it } from 'vitest'
import {
  apply,
  identity,
  multiply,
  rotateDeg,
  scale,
  translate,
} from './matrix'

describe('matrix', () => {
  it('identityは点を変化させない', () => {
    expect(apply(identity(), { x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
  })

  it('translateは平行移動する', () => {
    expect(apply(translate(10, 20), { x: 1, y: 1 })).toEqual({ x: 11, y: 21 })
  })

  it('scaleは拡大縮小する', () => {
    expect(apply(scale(2, 3), { x: 1, y: 1 })).toEqual({ x: 2, y: 3 })
  })

  it('rotateDegは反時計回りに回転する(SVGは時計回り正)', () => {
    const p = apply(rotateDeg(90), { x: 1, y: 0 })
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(1)
  })

  it('multiply(A,B)はBを先に適用してからAを適用する', () => {
    const m = multiply(translate(10, 0), scale(2, 2))
    // まずscale(2,2)で(1,1)->(2,2)、次にtranslate(10,0)で(12,2)
    expect(apply(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 2 })
  })
})
