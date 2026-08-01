import type { Matrix2D, Point, ViewBox } from '../geometry/types'

/** DPI・倍率設定からSVGユーザー単位1つあたりのmm換算スケールを求める(FR-2) */
export function computeScaleMmPerUnit(
  dpi: number,
  scaleFactor: number,
): number {
  return (25.4 / dpi) * scaleFactor
}

/**
 * SVG座標(原点左上・Y下向き)からプリンタ座標(原点左下・Y上向き)への変換(FR-4)。
 * プリンタY = (viewBoxのmin-y + viewBoxの高さ − SVG_Y) × スケール
 * プリンタX = (SVG_X − viewBoxのmin-x) × スケール
 */
export function svgToPrinterPoint(
  p: Point,
  viewBox: ViewBox,
  scaleMmPerUnit: number,
): Point {
  return {
    x: (p.x - viewBox.minX) * scaleMmPerUnit,
    y: (viewBox.minY + viewBox.height - p.y) * scaleMmPerUnit,
  }
}

/** svgToPrinterPointと等価な変換を表す単一のアフィン行列を返す */
export function svgToPrinterMatrix(
  viewBox: ViewBox,
  scaleMmPerUnit: number,
): Matrix2D {
  return {
    a: scaleMmPerUnit,
    b: 0,
    c: 0,
    d: -scaleMmPerUnit,
    e: -viewBox.minX * scaleMmPerUnit,
    f: (viewBox.minY + viewBox.height) * scaleMmPerUnit,
  }
}
