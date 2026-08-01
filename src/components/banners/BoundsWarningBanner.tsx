import type { OutOfBoundsWarning } from '../../core/gcode/types'
import { AlertBanner } from './AlertBanner'

function describeWarning(w: OutOfBoundsWarning): string {
  const target = w.sourceId
    ? `id="${w.sourceId}"`
    : `出現順${w.strokeIndex + 1}本目`
  return `${target} が描画可能領域からはみ出しています(${w.points.length}点)`
}

/**
 * FR-38/FR-41: 描画可能領域からのはみ出し警告。
 * ダウンロードブロックの理由を隠せないよう、閉じるボタンは設けない
 */
export function BoundsWarningBanner({
  warnings,
}: {
  warnings: OutOfBoundsWarning[]
}) {
  return (
    <AlertBanner
      title={`描画可能領域はみ出し警告(${warnings.length}件) — 解消するまでG-codeをダウンロードできません`}
      items={warnings.map(describeWarning)}
    />
  )
}
