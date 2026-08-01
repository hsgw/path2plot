import { useRef } from 'react'

interface SettingsActionsProps {
  onFileSelected: (text: string, fileName: string) => void
  /** FR-14: パス結合(端点結合)を実行する */
  onJoinPaths: () => void
  /** FR-15: 貪欲法による並び替えを実行する */
  onOptimize: () => void
  /** 並び替え・パス結合の上書きをすべてクリアし、出現順+未結合の状態に戻す */
  onResetAll: () => void
  /** パス結合/最適化ボタンのdisabled判定用 */
  hasEntries: boolean
  canDownloadGcode: boolean
  boundsWarningCount: number
  onDownloadGcode: () => void
}

/** 設定列の先頭に置く操作ボタン群(読み込み・並び順操作・G-code出力) */
export function SettingsActions({
  onFileSelected,
  onJoinPaths,
  onOptimize,
  onResetAll,
  hasEntries,
  canDownloadGcode,
  boundsWarningCount,
  onDownloadGcode,
}: SettingsActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => onFileSelected(text, file.name))
    e.target.value = ''
  }

  return (
    <div className="settings-actions">
      <input
        type="file"
        accept=".svg,image/svg+xml"
        ref={fileInputRef}
        className="settings-file-input-hidden"
        onChange={handleFileChange}
      />
      <button type="button" onClick={() => fileInputRef.current?.click()}>
        SVG読み込み
      </button>
      <button
        type="button"
        onClick={onJoinPaths}
        disabled={!hasEntries}
        title="FR-14: 端点が近いストローク同士を結合ブロック化する(読込直後は未実行)"
      >
        パス結合
      </button>
      <button type="button" onClick={onOptimize} disabled={!hasEntries}>
        最適化
      </button>
      <button type="button" onClick={onResetAll}>
        リセット
      </button>
      <button
        type="button"
        onClick={onDownloadGcode}
        disabled={!canDownloadGcode}
      >
        G-codeをダウンロード
      </button>
      {boundsWarningCount > 0 && (
        <p className="settings-warning-text">
          はみ出し警告({boundsWarningCount}
          件)が解消するまでダウンロードできません
        </p>
      )}
    </div>
  )
}
