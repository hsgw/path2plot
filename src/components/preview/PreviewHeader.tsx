interface PreviewHeaderProps {
  fileName: string | null
  /** タイトル欄に表示する本数の内訳(ストローク総数=通常ストローク+fill内の線) */
  strokeCount: number
  fillCount: number
  fillStrokeCount: number
  /** パス結合(FR-14)・書き順最適化(FR-15)が現在の内容に適用済みかどうか */
  joinApplied: boolean
  optimizeApplied: boolean
  /** FR-23: ステップ実行プレビュー。ListEntry単位の現在位置・総数 */
  step: number
  totalSteps: number
  playing: boolean
  onStep: (next: number) => void
  onTogglePlaying: () => void
  /** FR-24の開始点◯・方向矢印の表示切り替え */
  showDirection: boolean
  onToggleShowDirection: () => void
  /** FR-28: ペン先の実太さ描画の表示切り替え(ペン先の太さが未入力の場合は無効化される) */
  showActualWidth: boolean
  onToggleShowActualWidth: () => void
  penWidthMm: number
}

/** プレビュー列のタイトル欄とステップ実行の操作ボタン(FR-23) */
export function PreviewHeader({
  fileName,
  strokeCount,
  fillCount,
  fillStrokeCount,
  joinApplied,
  optimizeApplied,
  step,
  totalSteps,
  playing,
  onStep,
  onTogglePlaying,
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
      <div className="preview-step-controls">
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
        <div className="preview-step-buttons">
          <button
            type="button"
            onClick={() => onStep(Math.max(0, step - 1))}
            disabled={step <= 0}
          >
            前へ
          </button>
          <button
            type="button"
            onClick={() => onStep(Math.min(totalSteps, step + 1))}
            disabled={step >= totalSteps}
          >
            次へ
          </button>
          <button
            type="button"
            onClick={onTogglePlaying}
            disabled={totalSteps === 0}
          >
            {playing ? '停止' : '再生'}
          </button>
          <span className="preview-step-indicator">
            {step} / {totalSteps}
          </span>
        </div>
      </div>
    </div>
  )
}
