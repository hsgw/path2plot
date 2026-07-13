interface InvalidInputBannerProps {
  labels: string[]
}

/** 数値入力欄で不正な値が確定されたまま残っている項目を常時表示する警告。
 * 修正されるまでプレビューへの反映・G-codeダウンロードをブロックする */
export function InvalidInputBanner({ labels }: InvalidInputBannerProps) {
  if (labels.length === 0) return null

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-header">
        <h3>
          入力値が不正です({labels.length}件) —
          修正するまでプレビューへの反映・G-codeダウンロードができません
        </h3>
      </div>
      <ul>
        {labels.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </div>
  )
}
