import { useEffect } from 'react'
import type { FillPattern, FillSettings } from '../../core/fill/types'
import { NumberField } from '../common/NumberField'
import { visibleNumberFieldKeys } from './fillFieldKeys'
import { HatchSettingsFields } from './HatchSettingsFields'
import { useInvalidFields } from './useInvalidFields'

interface FillSettingsPanelProps {
  settings: FillSettings
  onSettingsChange: (settings: FillSettings) => void
  onInvalidFieldsChange: (labels: string[]) => void
}

/** FR-17〜21: 塗りつぶし設定。方式(pattern)ごとに表示する項目を切り替える */
export function FillSettingsPanel({
  settings,
  onSettingsChange,
  onInvalidFieldsChange,
}: FillSettingsPanelProps) {
  const { setValidity, retainOnly } = useInvalidFields(onInvalidFieldsChange)

  // 非表示になった欄の不正値は忘れる(再表示時にNumberFieldのdraftも有効な値に戻るため)
  useEffect(() => {
    retainOnly(visibleNumberFieldKeys(settings))
  }, [settings, retainOnly])

  const update = (patch: Partial<FillSettings>): void =>
    onSettingsChange({ ...settings, ...patch })

  const isHatch = settings.pattern === 'hatch'

  return (
    <div className="settings-group">
      <h3>塗りつぶし設定(FR-17〜21)</h3>
      <label className="settings-checkbox-label">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        塗りつぶし処理を有効にする
      </label>
      {settings.enabled && (
        <>
          <NumberField
            label="塗りオフセット(mm)"
            value={settings.fillOffsetMm}
            step={0.1}
            onCommit={(fillOffsetMm) => update({ fillOffsetMm })}
            onValidityChange={(valid) =>
              setValidity('fillOffsetMm', '塗りオフセット', valid)
            }
          />
          {isHatch ? (
            <label className="settings-checkbox-label">
              <input
                type="checkbox"
                checked={settings.drawOutline}
                onChange={(e) => update({ drawOutline: e.target.checked })}
              />
              輪郭線を描く(FR-21)
            </label>
          ) : (
            <p className="settings-hint">
              同心オフセット・スパイラルは最も外側のリングが輪郭そのものになるため、
              輪郭線(FR-21)は二重描画を避けて別途描きません
            </p>
          )}
          <p className="settings-hint">
            ペン(レイヤー)概念導入(Phase7)前は、全ての塗りブロックに共通の設定として適用されます。
            線幅入力欄はPhase7まで存在しないため、線間隔・塗りオフセットの既定値算出(FR-19/FR-20)は
            フォールバック値基準で、線の重ね量はまだ効果を持ちません
          </p>
          <label>
            塗りつぶし方式
            <select
              value={settings.pattern}
              onChange={(e) =>
                update({ pattern: e.target.value as FillPattern })
              }
            >
              <option value="hatch">ハッチ</option>
              <option value="concentric">同心オフセット</option>
              <option value="spiral">スパイラル</option>
            </select>
          </label>

          {isHatch && (
            <NumberField
              label="ハッチ角度(度)"
              value={settings.angleDeg}
              step={1}
              onCommit={(angleDeg) => update({ angleDeg })}
              onValidityChange={(valid) =>
                setValidity('angleDeg', 'ハッチ角度', valid)
              }
            />
          )}
          <NumberField
            label={isHatch ? '線間隔(mm)' : 'リング間隔(mm)'}
            value={settings.spacingMm}
            min={0.01}
            step={0.1}
            onCommit={(spacingMm) => update({ spacingMm })}
            onValidityChange={(valid) =>
              setValidity('spacingMm', '線間隔', valid)
            }
          />

          {isHatch && (
            <HatchSettingsFields
              settings={settings}
              onSettingsChange={onSettingsChange}
              setValidity={setValidity}
            />
          )}
        </>
      )}
    </div>
  )
}
