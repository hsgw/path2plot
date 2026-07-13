import type { OutOfBoundsWarning } from '../core/boundsCheck'

interface BoundsWarningBannerProps {
  warnings: OutOfBoundsWarning[]
}

function describeWarning(w: OutOfBoundsWarning): string {
  const target = w.sourceId
    ? `id="${w.sourceId}"`
    : `出現順${w.strokeIndex + 1}本目`
  return `${target} が描画可能領域からはみ出しています(${w.points.length}点)`
}

/** FR-38/FR-41: 設定列の開閉状態に関わらず常時表示するはみ出し警告(ダウンロードブロックの理由を示す) */
export function BoundsWarningBanner({ warnings }: BoundsWarningBannerProps) {
  if (warnings.length === 0) return null

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-header">
        <h3>
          描画可能領域はみ出し警告({warnings.length}件) —
          解消するまでG-codeをダウンロードできません
        </h3>
      </div>
      <ul>
        {warnings.map((w) => (
          <li key={w.strokeId}>{describeWarning(w)}</li>
        ))}
      </ul>
    </div>
  )
}
