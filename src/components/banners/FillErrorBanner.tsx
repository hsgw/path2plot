import type { FillGeometryError } from '../../core/fill/types'
import { AlertBanner } from './AlertBanner'

function describeError(error: FillGeometryError): string {
  const target = error.sourceId
    ? `id="${error.sourceId}"`
    : `塗りブロックID:${error.fillBlockId}`
  return `${error.message} (${target})`
}

/**
 * FR-20: 塗りオフセットの形状破綻警告。FR-38のはみ出し警告とは異なりG-codeダウンロードは
 * ブロックしない(該当ブロックが描画されないだけ)ため、閉じられる表示とする。
 */
export function FillErrorBanner({ errors }: { errors: FillGeometryError[] }) {
  return (
    <AlertBanner
      title={`塗りつぶしの形状破綻警告(${errors.length}件)`}
      items={errors.map(describeError)}
      dismissible
    />
  )
}
