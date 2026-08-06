import { useRef, useState } from 'react'
import { XMarkIcon } from '../common/icons'
import { FillSettingsPanel } from '../settings/FillSettingsPanel'
import { resolveEffectiveFillSettings } from '../../core/fill/overrides'
import type { FillSettings } from '../../core/fill/types'
import { useFloatingPanelDismiss } from './useFloatingPanelDismiss'

export interface FillOverridePopoverState {
  x: number
  y: number
  fillId: string
  fillLabel: string
}

/**
 * fill1件分の個別設定編集ポップオーバー。既存のFillSettingsPanelをそのまま埋め込み、
 * 実効設定(グローバル+このfillの上書き)を表示・編集する。編集した各フィールドは
 * そのままoverrideのpatchとしてonPatchOverrideへ渡す(未変更のフィールドはグローバルへ追従し続ける)
 */
export function FillOverridePopover({
  state,
  globalSettings,
  override,
  onPatchOverride,
  onResetOverride,
  onClose,
}: {
  state: FillOverridePopoverState
  globalSettings: FillSettings
  override: Partial<FillSettings> | undefined
  onPatchOverride: (fillId: string, patch: Partial<FillSettings>) => void
  onResetOverride: (fillId: string) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [invalidLabels, setInvalidLabels] = useState<string[]>([])
  const effective = resolveEffectiveFillSettings(globalSettings, override)
  const overridden = override !== undefined

  useFloatingPanelDismiss(panelRef, { x: state.x, y: state.y }, onClose)

  return (
    <div
      ref={panelRef}
      className="fill-override-popover"
      role="dialog"
      aria-label="塗り設定の個別編集"
      style={{ left: state.x, top: state.y }}
    >
      <div className="fill-override-popover-header">
        <span>{state.fillLabel}の個別設定</span>
        <button
          type="button"
          className="fill-override-popover-close"
          onClick={onClose}
        >
          <XMarkIcon />
        </button>
      </div>
      <button
        type="button"
        className="fill-override-popover-reset"
        disabled={!overridden}
        title={
          overridden
            ? undefined
            : 'このfillは個別設定を持っていません(グローバル設定に従っています)'
        }
        onClick={() => onResetOverride(state.fillId)}
      >
        元に戻す(グローバル設定を使う)
      </button>
      <div className="fill-override-popover-body">
        <FillSettingsPanel
          settings={effective}
          onSettingsChange={(patch) => onPatchOverride(state.fillId, patch)}
          onInvalidFieldsChange={setInvalidLabels}
        />
      </div>
      {invalidLabels.length > 0 && (
        <p className="fill-override-popover-hint">
          未確定の入力があります: {invalidLabels.join('、')}
        </p>
      )}
    </div>
  )
}
