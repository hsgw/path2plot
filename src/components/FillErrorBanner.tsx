import { useState } from 'react'
import type { FillGeometryError } from '../types/fill'

interface FillErrorBannerProps {
  errors: FillGeometryError[]
}

function describeError(error: FillGeometryError): string {
  const target = error.sourceId
    ? `id="${error.sourceId}"`
    : `塗りブロックID:${error.fillBlockId}`
  return `${error.message} (${target})`
}

/**
 * FR-20: 輪郭オフセットの形状破綻警告。FR-38のはみ出し警告とは異なりG-codeダウンロードは
 * ブロックしない(該当ブロックが描画されないだけ)ため、閉じられるErrorBanner相当の表示とする。
 */
export function FillErrorBanner({ errors }: FillErrorBannerProps) {
  const [closedSignature, setClosedSignature] = useState<string | null>(null)

  if (errors.length === 0) return null

  const signature = errors.map(describeError).join('\n')
  if (signature === closedSignature) return null

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-header">
        <h3>塗りつぶしの形状破綻警告({errors.length}件)</h3>
        <button type="button" onClick={() => setClosedSignature(signature)}>
          ×
        </button>
      </div>
      <ul>
        {errors.map((error, i) => (
          <li key={i}>{describeError(error)}</li>
        ))}
      </ul>
    </div>
  )
}
