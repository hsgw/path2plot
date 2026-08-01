import { AlertBanner } from './AlertBanner'

/**
 * 数値入力欄で不正な値が確定されたまま残っている項目の警告。
 * 修正されるまでプレビューへの反映・G-codeダウンロードをブロックするため、閉じられない
 */
export function InvalidInputBanner({ labels }: { labels: string[] }) {
  return (
    <AlertBanner
      title={`入力値が不正です(${labels.length}件) — 修正するまでプレビューへの反映・G-codeダウンロードができません`}
      items={labels}
    />
  )
}
