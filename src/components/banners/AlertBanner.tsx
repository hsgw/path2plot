import { useState, type ReactNode } from 'react'
import { XMarkIcon } from '../common/icons'

interface AlertBannerProps {
  /** 見出し。件数や「解消するまで〜できません」等の但し書きも含めて呼び出し側が組み立てる */
  title: ReactNode
  /** 箇条書きにする本文。空なら何も表示しない */
  items: string[]
  /**
   * 手動で閉じられるようにするか。閉じたあとも内容が変われば自動的に再表示する。
   * ダウンロードをブロックする種類の警告は、理由を隠せないよう閉じられなくする(既定)
   */
  dismissible?: boolean
}

/**
 * FR-41: 設定列の開閉状態に関わらず画面上部に常時表示される警告・エラーの共通表示。
 * パースエラー・はみ出し警告・塗りの形状破綻・入力値不正はいずれもこの見た目を共有する。
 */
export function AlertBanner({
  title,
  items,
  dismissible = false,
}: AlertBannerProps) {
  const [closedSignature, setClosedSignature] = useState<string | null>(null)

  if (items.length === 0) return null

  const signature = items.join('\n')
  if (dismissible && signature === closedSignature) return null

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-header">
        <h3>{title}</h3>
        {dismissible && (
          <button type="button" onClick={() => setClosedSignature(signature)}>
            <XMarkIcon />
          </button>
        )}
      </div>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
