import { useEffect, useState } from 'react'
import type { FillSettings } from '../types/fill'
import { NumberField } from './NumberField'

interface FillSettingsPanelProps {
  settings: FillSettings
  onSettingsChange: (settings: FillSettings) => void
  onInvalidFieldsChange: (labels: string[]) => void
}

export function FillSettingsPanel({
  settings,
  onSettingsChange,
  onInvalidFieldsChange,
}: FillSettingsPanelProps) {
  const [invalidFields, setInvalidFields] = useState<Map<string, string>>(
    new Map(),
  )

  useEffect(() => {
    // enabled=falseの間は数値入力欄自体が非表示になるため、その不正値を報告し続けない
    onInvalidFieldsChange(
      settings.enabled ? Array.from(invalidFields.values()) : [],
    )
  }, [invalidFields, onInvalidFieldsChange, settings.enabled])

  const handleValidity = (key: string, label: string, valid: boolean): void => {
    setInvalidFields((prev) => {
      const next = new Map(prev)
      if (valid) next.delete(key)
      else next.set(key, label)
      return next
    })
  }

  return (
    <div className="settings-group">
      <h3>塗りつぶし設定(FR-17〜21)</h3>
      <label className="settings-checkbox-label">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) =>
            onSettingsChange({ ...settings, enabled: e.target.checked })
          }
        />
        塗りつぶし処理を有効にする
      </label>
      {settings.enabled && (
        <>
          <p className="settings-hint">
            ペン(レイヤー)概念導入(Phase7)前は、全ての塗りブロックに共通の設定として適用されます。
            線幅入力欄はPhase7まで存在しないため、線間隔・輪郭オフセットの既定値算出(FR-19/FR-20)は
            フォールバック値基準で、線の重ね量はまだ効果を持ちません
          </p>
          <NumberField
            label="ハッチ角度(度)"
            value={settings.angleDeg}
            step={1}
            onCommit={(angleDeg) => onSettingsChange({ ...settings, angleDeg })}
            onValidityChange={(valid) =>
              handleValidity('angleDeg', 'ハッチ角度', valid)
            }
          />
          <NumberField
            label="線間隔(mm)"
            value={settings.spacingMm}
            min={0.01}
            step={0.1}
            onCommit={(spacingMm) =>
              onSettingsChange({ ...settings, spacingMm })
            }
            onValidityChange={(valid) =>
              handleValidity('spacingMm', '線間隔', valid)
            }
          />
          <NumberField
            label="輪郭オフセット(mm)"
            value={settings.contourOffsetMm}
            step={0.1}
            onCommit={(contourOffsetMm) =>
              onSettingsChange({ ...settings, contourOffsetMm })
            }
            onValidityChange={(valid) =>
              handleValidity('contourOffsetMm', '輪郭オフセット', valid)
            }
          />
          <label className="settings-checkbox-label">
            <input
              type="checkbox"
              checked={settings.zigzag}
              onChange={(e) =>
                onSettingsChange({ ...settings, zigzag: e.target.checked })
              }
            />
            ジグザグ結合(一筆書き、FR-18)
          </label>
          {settings.zigzag && (
            <>
              <NumberField
                label="ジグザグ接続許容距離の倍率(線間隔に対する倍率)"
                value={settings.zigzagToleranceFactor}
                min={0.1}
                step={0.1}
                onCommit={(zigzagToleranceFactor) =>
                  onSettingsChange({ ...settings, zigzagToleranceFactor })
                }
                onValidityChange={(valid) =>
                  handleValidity(
                    'zigzagToleranceFactor',
                    'ジグザグ接続許容距離の倍率',
                    valid,
                  )
                }
              />
              <p className="settings-hint">
                角度によってはハッチ行の幅が行ごとに変化するため、等倍(1.0)では一筆書きにならない
                ことがあります。プレビューを見ながら値を大きくして調整してください(大きくしすぎると
                接続線が長くなり見た目が濃くなります)
              </p>
            </>
          )}
          <label className="settings-checkbox-label">
            <input
              type="checkbox"
              checked={settings.drawOutline}
              onChange={(e) =>
                onSettingsChange({ ...settings, drawOutline: e.target.checked })
              }
            />
            輪郭線を描く(FR-21)
          </label>
        </>
      )}
    </div>
  )
}
