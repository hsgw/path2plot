import { useEffect, useState } from 'react'
import type {
  FillPattern,
  FillSettings,
  HatchConnectMode,
  HatchWaveform,
} from '../types/fill'
import { NumberField } from './NumberField'

interface FillSettingsPanelProps {
  settings: FillSettings
  onSettingsChange: (settings: FillSettings) => void
  onInvalidFieldsChange: (labels: string[]) => void
}

/**
 * 現在の設定で実際に表示されている数値入力欄のキー。
 * NumberFieldは不正値のままアンマウントされてもonValidityChange(true)を呼ばないため、
 * 隠れた欄の不正値が残り続けてG-codeダウンロードが解除されなくなるのを防ぐのに使う。
 */
function visibleNumberFieldKeys(settings: FillSettings): Set<string> {
  if (!settings.enabled) return new Set()
  const keys = ['spacingMm', 'contourOffsetMm']
  if (settings.pattern === 'hatch') {
    keys.push('angleDeg')
    if (settings.crossHatch) keys.push('crossAngleDeg')
    if (settings.connect === 'boustrophedon') keys.push('connectDistanceFactor')
    // ジグザグは行の端点しか使わないため波形は結果に現れず、欄自体を出さない
    if (settings.connect !== 'zigzag' && settings.waveform !== 'straight') {
      keys.push('waveAmplitudeMm', 'waveLengthMm')
      if (settings.waveform === 'sine') keys.push('waveSegmentsPerCycle')
    }
  }
  return new Set(keys)
}

export function FillSettingsPanel({
  settings,
  onSettingsChange,
  onInvalidFieldsChange,
}: FillSettingsPanelProps) {
  const [invalidFields, setInvalidFields] = useState<Map<string, string>>(
    new Map(),
  )

  // 非表示になった欄の不正値は忘れる(再表示時にNumberFieldのdraftも有効な値に戻るため)
  useEffect(() => {
    const visible = visibleNumberFieldKeys(settings)
    setInvalidFields((prev) => {
      const next = new Map(prev)
      let changed = false
      for (const key of prev.keys()) {
        if (!visible.has(key)) {
          next.delete(key)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [settings])

  useEffect(() => {
    onInvalidFieldsChange(Array.from(invalidFields.values()))
  }, [invalidFields, onInvalidFieldsChange])

  const handleValidity = (key: string, label: string, valid: boolean): void => {
    setInvalidFields((prev) => {
      const next = new Map(prev)
      if (valid) next.delete(key)
      else next.set(key, label)
      return next
    })
  }

  const isHatch = settings.pattern === 'hatch'

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
          <label>
            塗りつぶし方式
            <select
              value={settings.pattern}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  pattern: e.target.value as FillPattern,
                })
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
              onCommit={(angleDeg) =>
                onSettingsChange({ ...settings, angleDeg })
              }
              onValidityChange={(valid) =>
                handleValidity('angleDeg', 'ハッチ角度', valid)
              }
            />
          )}
          <NumberField
            label={isHatch ? '線間隔(mm)' : 'リング間隔(mm)'}
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

          {isHatch && (
            <>
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.crossHatch}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      crossHatch: e.target.checked,
                    })
                  }
                />
                クロスハッチ(2方向を重ねる)
              </label>
              {settings.crossHatch && (
                <NumberField
                  label="第2方向の角度(度)"
                  value={settings.crossAngleDeg}
                  step={1}
                  onCommit={(crossAngleDeg) =>
                    onSettingsChange({ ...settings, crossAngleDeg })
                  }
                  onValidityChange={(valid) =>
                    handleValidity('crossAngleDeg', '第2方向の角度', valid)
                  }
                />
              )}

              <label>
                ハッチ線の連結
                <select
                  value={settings.connect}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      connect: e.target.value as HatchConnectMode,
                    })
                  }
                >
                  <option value="none">連結しない</option>
                  <option value="zigzag">ジグザグ</option>
                  <option value="boustrophedon">往復</option>
                </select>
              </label>
              {settings.connect === 'zigzag' && (
                <p className="settings-hint">
                  各行の左右の端点を交互に拾い、斜めに繋いだ一筆書きを描きます(L0→R1→L2→R3…)。
                  ハッチ線そのものは描かれません。戻り線が行間を通るため、実際の線密度は
                  線間隔から想像されるより高くなります。塗り領域の外へ出る接続は行わず、
                  その位置で線を分けます
                </p>
              )}
              {settings.connect === 'boustrophedon' && (
                <>
                  <NumberField
                    label="接続距離の上限(線間隔に対する倍率)"
                    value={settings.connectDistanceFactor}
                    min={0.1}
                    step={0.5}
                    onCommit={(connectDistanceFactor) =>
                      onSettingsChange({ ...settings, connectDistanceFactor })
                    }
                    onValidityChange={(valid) =>
                      handleValidity(
                        'connectDistanceFactor',
                        '接続距離の上限',
                        valid,
                      )
                    }
                  />
                  <p className="settings-hint">
                    ハッチ線を描いた上で、隣接行の同じ側の端点同士を繋いで往復させます。
                    端点同士の移動は輪郭(輪郭オフセットを設定している場合はオフセット後の輪郭)を
                    なぞる場合のみ行い、輪郭を辿れない位置(穴の境界と外形をまたぐ場合など)や
                    一度なぞった輪郭へは繋がずに線を分けます。上限は端点までの直線距離に対する
                    もので、リスト上の次のラインへの接続だけは上限を超えても許容します
                  </p>
                </>
              )}

              {settings.connect !== 'zigzag' && (
                <>
                  <label>
                    線の形状
                    <select
                      value={settings.waveform}
                      onChange={(e) =>
                        onSettingsChange({
                          ...settings,
                          waveform: e.target.value as HatchWaveform,
                        })
                      }
                    >
                      <option value="straight">直線</option>
                      <option value="sine">正弦波</option>
                      <option value="triangle">三角波</option>
                    </select>
                  </label>
                  {settings.waveform !== 'straight' && (
                    <>
                      <NumberField
                        label="振幅(mm)"
                        value={settings.waveAmplitudeMm}
                        min={0}
                        step={0.1}
                        onCommit={(waveAmplitudeMm) =>
                          onSettingsChange({ ...settings, waveAmplitudeMm })
                        }
                        onValidityChange={(valid) =>
                          handleValidity('waveAmplitudeMm', '振幅', valid)
                        }
                      />
                      <NumberField
                        label="波長(mm)"
                        value={settings.waveLengthMm}
                        min={0.01}
                        step={0.1}
                        onCommit={(waveLengthMm) =>
                          onSettingsChange({ ...settings, waveLengthMm })
                        }
                        onValidityChange={(valid) =>
                          handleValidity('waveLengthMm', '波長', valid)
                        }
                      />
                      {settings.waveform === 'sine' && (
                        <NumberField
                          label="1周期あたりの分割数"
                          value={settings.waveSegmentsPerCycle}
                          min={2}
                          step={1}
                          onCommit={(waveSegmentsPerCycle) =>
                            onSettingsChange({
                              ...settings,
                              waveSegmentsPerCycle,
                            })
                          }
                          onValidityChange={(valid) =>
                            handleValidity(
                              'waveSegmentsPerCycle',
                              '1周期あたりの分割数',
                              valid,
                            )
                          }
                        />
                      )}
                      <p className="settings-hint">
                        振幅は隣接行と干渉しないよう、線間隔の半分を上限として自動的に抑えられます
                      </p>
                    </>
                  )}
                </>
              )}
            </>
          )}

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
          {isHatch ? (
            <label className="settings-checkbox-label">
              <input
                type="checkbox"
                checked={settings.drawOutline}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    drawOutline: e.target.checked,
                  })
                }
              />
              輪郭線を描く(FR-21)
            </label>
          ) : (
            <p className="settings-hint">
              同心オフセット・スパイラルは最も外側のリングが輪郭そのものになるため、
              輪郭線(FR-21)は二重描画を避けて別途描きません
            </p>
          )}
        </>
      )}
    </div>
  )
}
