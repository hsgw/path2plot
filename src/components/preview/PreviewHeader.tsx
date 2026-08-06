interface PreviewHeaderProps {
  fileName: string | null
  /** タイトル欄に表示する本数の内訳(ストローク総数=通常ストローク+fill内の線) */
  strokeCount: number
  fillCount: number
  fillStrokeCount: number
  /** パス結合(FR-14)・書き順最適化(FR-15)が現在の内容に適用済みかどうか */
  joinApplied: boolean
  optimizeApplied: boolean
  /** FR-24の開始点◯・方向矢印の表示切り替え */
  showDirection: boolean
  onToggleShowDirection: () => void
  /** FR-28: ペン先の実太さ描画の表示切り替え(ペン先の太さが未入力の場合は無効化される) */
  showActualWidth: boolean
  onToggleShowActualWidth: () => void
  penWidthMm: number
}

/** プレビュー列のタイトル欄と表示切り替えボタン */
export function PreviewHeader({
  fileName,
  strokeCount,
  fillCount,
  fillStrokeCount,
  joinApplied,
  optimizeApplied,
  showDirection,
  onToggleShowDirection,
  showActualWidth,
  onToggleShowActualWidth,
  penWidthMm,
}: PreviewHeaderProps) {
  return (
    <div className="panel-header">
      <div className="preview-title">
        <h2>プレビュー</h2>
        <span className="preview-filename">{fileName ?? 'ファイルなし'}</span>
        {fileName !== null && (
          <span className="preview-stats">
            ストローク {strokeCount} フィル {fillCount} ({fillStrokeCount})
          </span>
        )}
        <span className="preview-flags">
          {joinApplied && <span className="preview-flag">結合済み</span>}
          {optimizeApplied && <span className="preview-flag">最適化済み</span>}
        </span>
      </div>
      <div className="preview-controls">
        <div className="preview-toggle-group">
          <button
            type="button"
            className={showDirection ? 'preview-toggle-active' : undefined}
            aria-pressed={showDirection}
            onClick={onToggleShowDirection}
            title="開始点・方向の表示を切り替え"
          >
            開始点/方向
          </button>
          <button
            type="button"
            className={showActualWidth ? 'preview-toggle-active' : undefined}
            aria-pressed={showActualWidth}
            onClick={onToggleShowActualWidth}
            disabled={penWidthMm <= 0}
            title={
              penWidthMm <= 0
                ? 'ペン先の太さが未入力です'
                : 'ペン太さ表示の切り替え'
            }
          >
            ペン太さ
          </button>
        </div>
      </div>
    </div>
  )
}
