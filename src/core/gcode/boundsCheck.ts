import type { FillCandidate } from '../fill/types'
import type { Point } from '../geometry/types'
import type { ParsedStroke } from '../svg/types'
import type { BedSize, OutOfBoundsWarning } from './types'

/**
 * 点が描画可能領域(X:0〜widthMm、Y:0〜heightMm)からはみ出しているか判定する(FR-38/NFR-3)。
 * marginMmは円弧・ベジェの直線近似誤差(サギッタ)を安全マージンとして加える場合に指定する
 * (Phase3時点のfixtureは直線のみのため既定は0。円弧・ベジェのマージン適用はPhase4/5で対応)。
 */
export function isPointOutOfBounds(
  p: Point,
  bed: BedSize,
  marginMm = 0,
): boolean {
  return (
    p.x < marginMm ||
    p.x > bed.widthMm - marginMm ||
    p.y < marginMm ||
    p.y > bed.heightMm - marginMm
  )
}

/** ストローク群のうち描画可能領域からはみ出すものを検出する(FR-38) */
export function checkStrokeBounds(
  strokes: ParsedStroke[],
  bed: BedSize,
  marginMm = 0,
): OutOfBoundsWarning[] {
  const warnings: OutOfBoundsWarning[] = []
  strokes.forEach((stroke, index) => {
    const offending = stroke.points.filter((p) =>
      isPointOutOfBounds(p, bed, marginMm),
    )
    if (offending.length > 0) {
      warnings.push({
        kind: 'stroke',
        index,
        id: stroke.id,
        sourceId: stroke.sourceId,
        points: offending,
      })
    }
  })
  return warnings
}

/**
 * 塗り候補群(FillCandidate)のうち描画可能領域からはみ出すものを検出する(FR-38)。
 * strokeを持たずfillのみが可視な要素は`checkStrokeBounds`の対象(ParsedStroke)に
 * 一切現れないため、はみ出し検出には塗り候補の輪郭点を別途チェックする必要がある
 * (塗り生成後のハッチ線・オフセット線は常に輪郭の内側に収まる想定のため、輪郭点のみで足りる)
 */
export function checkFillCandidateBounds(
  fillCandidates: FillCandidate[],
  bed: BedSize,
  marginMm = 0,
): OutOfBoundsWarning[] {
  const warnings: OutOfBoundsWarning[] = []
  fillCandidates.forEach((candidate, index) => {
    const offending = candidate.contours
      .flat()
      .filter((p) => isPointOutOfBounds(p, bed, marginMm))
    if (offending.length > 0) {
      warnings.push({
        kind: 'fill',
        index,
        id: candidate.id,
        sourceId: candidate.sourceId,
        points: offending,
      })
    }
  })
  return warnings
}
