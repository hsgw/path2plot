import { describe, expect, it } from 'vitest'
import { apply } from './matrix'
import {
  computeScaleMmPerUnit,
  svgToPrinterMatrix,
  svgToPrinterPoint,
} from './coordinateTransform'

describe('computeScaleMmPerUnit', () => {
  it('96dpi・倍率1のとき1px=25.4/96mmになる', () => {
    expect(computeScaleMmPerUnit(96, 1)).toBeCloseTo(25.4 / 96)
  })

  it('倍率を掛け合わせられる', () => {
    expect(computeScaleMmPerUnit(96, 2)).toBeCloseTo((25.4 / 96) * 2)
  })
})

describe('svgToPrinterPoint', () => {
  it('viewBoxが0始まりの場合、SVGの最下端がプリンタY=0に対応する(FR-4)', () => {
    const viewBox = { minX: 0, minY: 0, width: 200, height: 100 }
    const p = svgToPrinterPoint({ x: 0, y: 100 }, viewBox, 1)
    expect(p).toEqual({ x: 0, y: 0 })
  })

  it('SVGの最上端はプリンタYがviewBoxの高さ×スケールになる', () => {
    const viewBox = { minX: 0, minY: 0, width: 200, height: 100 }
    const p = svgToPrinterPoint({ x: 0, y: 0 }, viewBox, 2)
    expect(p).toEqual({ x: 0, y: 200 })
  })

  it('viewBoxのmin-x/min-yが非ゼロの場合を正しくオフセットする', () => {
    // fixtures/phase1/viewbox-offset.svg相当: viewBox="50 30 100 100"
    const viewBox = { minX: 50, minY: 30, width: 100, height: 100 }
    const p = svgToPrinterPoint({ x: 50, y: 30 }, viewBox, 1)
    // SVG_Y=30(最上端) -> printerY = (30+100-30) = 100
    expect(p).toEqual({ x: 0, y: 100 })

    const bottom = svgToPrinterPoint({ x: 150, y: 130 }, viewBox, 1)
    // SVG_Y=130(最下端) -> printerY = (30+100-130) = 0
    expect(bottom).toEqual({ x: 100, y: 0 })
  })

  it('viewBox未指定時はmin-y=0として扱う', () => {
    const viewBox = { minX: 0, minY: 0, width: 50, height: 50 }
    const p = svgToPrinterPoint({ x: 10, y: 10 }, viewBox, 1)
    expect(p).toEqual({ x: 10, y: 40 })
  })
})

describe('svgToPrinterMatrix', () => {
  it('svgToPrinterPointと同じ結果になる', () => {
    const viewBox = { minX: 50, minY: 30, width: 100, height: 100 }
    const scale = 1.5
    const m = svgToPrinterMatrix(viewBox, scale)
    const samples = [
      { x: 50, y: 30 },
      { x: 150, y: 130 },
      { x: 90, y: 70 },
    ]
    for (const s of samples) {
      const viaMatrix = apply(m, s)
      const viaFormula = svgToPrinterPoint(s, viewBox, scale)
      expect(viaMatrix.x).toBeCloseTo(viaFormula.x)
      expect(viaMatrix.y).toBeCloseTo(viaFormula.y)
    }
  })
})
