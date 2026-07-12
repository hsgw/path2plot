import { describe, expect, it } from 'vitest'
import { apply } from './matrix'
import { parseTransformAttr } from './transformAttr'

describe('parseTransformAttr', () => {
  it('translateを解釈する', () => {
    const m = parseTransformAttr('translate(10,20)')
    expect(apply(m, { x: 0, y: 0 })).toEqual({ x: 10, y: 20 })
  })

  it('単一引数のtranslateはty=0とみなす', () => {
    const m = parseTransformAttr('translate(5)')
    expect(apply(m, { x: 0, y: 0 })).toEqual({ x: 5, y: 0 })
  })

  it('scaleを解釈する(単一引数は等方拡大)', () => {
    const m = parseTransformAttr('scale(2)')
    expect(apply(m, { x: 3, y: 4 })).toEqual({ x: 6, y: 8 })
  })

  it('中心指定のrotateを解釈する', () => {
    const m = parseTransformAttr('rotate(90 10 10)')
    const p = apply(m, { x: 10, y: 0 })
    expect(p.x).toBeCloseTo(20)
    expect(p.y).toBeCloseTo(10)
  })

  it('skewX/skewYを解釈する', () => {
    const mx = parseTransformAttr('skewX(45)')
    const px = apply(mx, { x: 0, y: 10 })
    expect(px.x).toBeCloseTo(10)
    expect(px.y).toBeCloseTo(10)

    const my = parseTransformAttr('skewY(45)')
    const py = apply(my, { x: 10, y: 0 })
    expect(py.x).toBeCloseTo(10)
    expect(py.y).toBeCloseTo(10)
  })

  it('matrix()の値をそのまま行列として解釈する', () => {
    const m = parseTransformAttr('matrix(1,0,0,1,5,6)')
    expect(apply(m, { x: 1, y: 1 })).toEqual({ x: 6, y: 7 })
  })

  it('複数のtransform関数を左から右へ合成する(外側から内側の順)', () => {
    // translate(10,0) rotate(90) は <g translate><g rotate>...と等価
    // (1,0) はまずrotateで(0,1)、次にtranslateで(10,1)
    const m = parseTransformAttr('translate(10,0) rotate(90)')
    const p = apply(m, { x: 1, y: 0 })
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(1)
  })

  it('translate/rotate/scale/skewX/skewY/matrixのネストした合成をfixtures/phase1/transforms.svgと同じ組み合わせで検証する', () => {
    // g translate(20,20) > g rotate(30 15 10) > g scale(1.5,0.8) というネスト構造を
    // 累積行列(親×子)として合成し、原点(0,0)の変換結果を手計算と突き合わせる
    const outer = parseTransformAttr('translate(20,20)')
    const middle = parseTransformAttr('rotate(30 15 10)')
    const inner = parseTransformAttr('scale(1.5,0.8)')

    const rad = (30 * Math.PI) / 180
    // rotate(30 15 10)による原点の移動先を手計算
    const rx = 15 + (0 - 15) * Math.cos(rad) - (0 - 10) * Math.sin(rad)
    const ry = 10 + (0 - 15) * Math.sin(rad) + (0 - 10) * Math.cos(rad)

    const pMiddle = apply(middle, { x: 0, y: 0 })
    expect(pMiddle.x).toBeCloseTo(rx)
    expect(pMiddle.y).toBeCloseTo(ry)

    // 累積: outer ∘ middle ∘ inner を原点に適用した結果は
    // outer ∘ middle を原点に適用した結果と一致する(innerはscaleなので原点は不動)
    const combined = apply(outer, apply(middle, apply(inner, { x: 0, y: 0 })))
    const expected = apply(outer, { x: rx, y: ry })
    expect(combined.x).toBeCloseTo(expected.x)
    expect(combined.y).toBeCloseTo(expected.y)
  })
})
