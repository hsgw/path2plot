import { useState } from 'react'
import type { SvgParseError } from '../types/svg'

interface ErrorBannerProps {
  errors: SvgParseError[]
}

function describeError(error: SvgParseError): string {
  if (error.kind === 'parse-error') {
    const location =
      error.line !== undefined
        ? `(行:${error.line}${error.column !== undefined ? ` 列:${error.column}` : ''})`
        : ''
    return `SVGの解析に失敗しました${location}: ${error.message}`
  }
  const target = error.elementId
    ? `id="${error.elementId}"`
    : `出現順インデックス:${error.elementIndex}`
  return `${error.message} (${target})`
}

export function ErrorBanner({ errors }: ErrorBannerProps) {
  const [closedSignature, setClosedSignature] = useState<string | null>(null)

  if (errors.length === 0) return null

  const signature = errors.map(describeError).join('\n')
  if (signature === closedSignature) return null

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-header">
        <h3>エラー({errors.length}件)</h3>
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
