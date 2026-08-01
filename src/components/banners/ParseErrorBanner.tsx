import type { SvgParseError } from '../../core/svg/types'
import { AlertBanner } from './AlertBanner'

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

/** FR-36: SVGのパースエラー・未対応要素エラー。内容が変わらない限り手動で閉じておける */
export function ParseErrorBanner({ errors }: { errors: SvgParseError[] }) {
  return (
    <AlertBanner
      title={`エラー(${errors.length}件)`}
      items={errors.map(describeError)}
      dismissible
    />
  )
}
