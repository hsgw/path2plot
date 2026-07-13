import type { Point } from '../types/geometry'
import { clipOpenLinesToPolygon } from './fillPolygon'
import { apply, rotateDeg } from './matrix'

/**
 * FR-17/19: オフセット済みの塗り輪郭(穴を含む)に対し、角度・間隔を指定して平行線ハッチングを
 * 生成する。angleDeg分だけ回転した空間で等間隔の走査線を作り、逆回転してからoffsetPathsで
 * 一括クリップする。戻り値は行番号昇順・各行内はx昇順(回転空間基準)に整列した正規順序。
 */
export function generateHatchLines(
  offsetPaths: Point[][],
  angleDeg: number,
  spacingMm: number,
): Point[][] {
  if (offsetPaths.length === 0 || spacingMm <= 0) return []

  const toRotated = rotateDeg(-angleDeg)
  const toReal = rotateDeg(angleDeg)

  const rotatedPoints = offsetPaths.flatMap((path) =>
    path.map((p) => apply(toRotated, p)),
  )
  if (rotatedPoints.length === 0) return []

  const minX = Math.min(...rotatedPoints.map((p) => p.x))
  const maxX = Math.max(...rotatedPoints.map((p) => p.x))
  const minY = Math.min(...rotatedPoints.map((p) => p.y))
  const maxY = Math.max(...rotatedPoints.map((p) => p.y))

  const firstRowY = minY + spacingMm / 2
  const rawLines: Point[][] = []
  for (let y = firstRowY; y <= maxY; y += spacingMm) {
    rawLines.push([
      apply(toReal, { x: minX, y }),
      apply(toReal, { x: maxX, y }),
    ])
  }
  if (rawLines.length === 0) return []

  const clipped = clipOpenLinesToPolygon(rawLines, offsetPaths)

  const withRowInfo = clipped.map((segment) => {
    const rotatedSegment = segment.map((p) => apply(toRotated, p))
    const rowIndex = Math.round((rotatedSegment[0].y - firstRowY) / spacingMm)
    const rotatedStartX = rotatedSegment[0].x
    const rotatedEndX = rotatedSegment.at(-1)!.x
    const ascending =
      rotatedStartX <= rotatedEndX ? segment : [...segment].reverse()
    return {
      rowIndex,
      x: Math.min(rotatedStartX, rotatedEndX),
      segment: ascending,
    }
  })

  withRowInfo.sort((a, b) => a.rowIndex - b.rowIndex || a.x - b.x)
  return withRowInfo.map((w) => w.segment)
}
