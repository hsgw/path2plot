import type { ProcessingPhase } from '../../core/worker/protocol'

interface ProcessingOverlayProps {
  isProcessing: boolean
  phase: ProcessingPhase | null
  percent: number
}

const PHASE_LABELS: Record<ProcessingPhase, string> = {
  fill: '塗りを生成中…',
  join: 'パスを結合中…',
}

export function ProcessingOverlay({
  isProcessing,
  phase,
  percent,
}: ProcessingOverlayProps) {
  if (!isProcessing) return null

  return (
    <div className="modal-backdrop processing-overlay-backdrop">
      <div className="processing-overlay" role="status" aria-live="polite">
        <div className="processing-overlay-label">
          {phase ? PHASE_LABELS[phase] : '処理中…'}
        </div>
        <div className="processing-overlay-track">
          <div
            className="processing-overlay-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  )
}
