import { useEffect, useRef, useState } from 'react'
import type { GcodeSettings } from '../types/gcode'
import type { FillSettings } from '../types/fill'
import type { ParseSettings } from '../types/svg'
import { FillSettingsPanel } from './FillSettingsPanel'
import { GcodeSettingsPanel } from './GcodeSettingsPanel'
import { NumberField } from './NumberField'

interface SettingsPanelProps {
  settings: ParseSettings
  onFileSelected: (text: string, fileName: string) => void
  onSettingsChange: (settings: ParseSettings) => void
  onSettingsInvalidChange: (labels: string[]) => void
  gcodeSettings: GcodeSettings
  onGcodeSettingsChange: (settings: GcodeSettings) => void
  onGcodeInvalidChange: (labels: string[]) => void
  /** FR-14: 端点結合距離(mm) */
  joinDistanceMm: number
  onJoinDistanceChange: (joinDistanceMm: number) => void
  /** FR-14: パス結合(端点結合)を実行する */
  onJoinPaths: () => void
  /** FR-15: 貪欲法による並び替えを実行する */
  onOptimize: () => void
  /** 並び替え・パス結合の上書きをすべてクリアし、出現順+未結合の状態に戻す */
  onResetAll: () => void
  /** パス結合/最適化ボタンのdisabled判定用 */
  hasEntries: boolean
  fillSettings: FillSettings
  onFillSettingsChange: (settings: FillSettings) => void
  onFillInvalidChange: (labels: string[]) => void
  canDownloadGcode: boolean
  boundsWarningCount: number
  onDownloadGcode: () => void
}

export function SettingsPanel({
  settings,
  onFileSelected,
  onSettingsChange,
  onSettingsInvalidChange,
  gcodeSettings,
  onGcodeSettingsChange,
  onGcodeInvalidChange,
  joinDistanceMm,
  onJoinDistanceChange,
  onJoinPaths,
  onOptimize,
  onResetAll,
  hasEntries,
  fillSettings,
  onFillSettingsChange,
  onFillInvalidChange,
  canDownloadGcode,
  boundsWarningCount,
  onDownloadGcode,
}: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  // 設定項目はSVG読み込み系(読み込み・パス結合・塗りつぶし)とG-code出力系の2タブに分ける。
  // 非表示側のタブもDOM上には残す(hidden属性)ことで、入力途中の値や不正値の報告状態が
  // タブ切り替えでリセットされないようにする
  const [activeTab, setActiveTab] = useState<'svg' | 'gcode'>('svg')
  const [invalidFields, setInvalidFields] = useState<Map<string, string>>(
    new Map(),
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onSettingsInvalidChange(Array.from(invalidFields.values()))
  }, [invalidFields, onSettingsInvalidChange])

  const handleValidity = (key: string, label: string, valid: boolean): void => {
    setInvalidFields((prev) => {
      const next = new Map(prev)
      if (valid) next.delete(key)
      else next.set(key, label)
      return next
    })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => onFileSelected(text, file.name))
    e.target.value = ''
  }

  return (
    <section
      className={`panel panel-settings${isOpen ? '' : ' panel-collapsed'}`}
    >
      <div className="panel-header">
        {isOpen && <h2>設定</h2>}
        <button type="button" onClick={() => setIsOpen((v) => !v)}>
          {isOpen ? '«' : '»'}
        </button>
      </div>
      {isOpen && (
        <div className="panel-body panel-body-settings">
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

          <div className="settings-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className="settings-tab"
              aria-selected={activeTab === 'svg'}
              onClick={() => setActiveTab('svg')}
            >
              SVG
            </button>
            <button
              type="button"
              role="tab"
              className="settings-tab"
              aria-selected={activeTab === 'gcode'}
              onClick={() => setActiveTab('gcode')}
            >
              G-code
            </button>
          </div>

          <div
            role="tabpanel"
            className="settings-tabpanel"
            hidden={activeTab !== 'svg'}
          >
            <div className="settings-group">
              <h3>読み込み設定</h3>
              <NumberField
                label="DPI"
                value={settings.dpi}
                min={1}
                step={1}
                onCommit={(dpi) => onSettingsChange({ ...settings, dpi })}
                onValidityChange={(valid) =>
                  handleValidity('dpi', 'DPI', valid)
                }
              />
              <NumberField
                label="倍率"
                value={settings.scaleFactor}
                min={0.001}
                step={0.1}
                onCommit={(scaleFactor) =>
                  onSettingsChange({ ...settings, scaleFactor })
                }
                onValidityChange={(valid) =>
                  handleValidity('scaleFactor', '倍率', valid)
                }
              />
              <NumberField
                label="ベジェ折線化許容誤差(mm)"
                value={settings.bezierToleranceMm}
                min={0.001}
                step={0.01}
                onCommit={(bezierToleranceMm) =>
                  onSettingsChange({ ...settings, bezierToleranceMm })
                }
                onValidityChange={(valid) =>
                  handleValidity(
                    'bezierToleranceMm',
                    'ベジェ折線化許容誤差',
                    valid,
                  )
                }
              />
            </div>

            <div className="settings-group">
              <h3>パス結合(FR-14)</h3>
              <NumberField
                label="端点結合距離(mm)"
                value={joinDistanceMm}
                min={0}
                step={0.1}
                onCommit={onJoinDistanceChange}
                onValidityChange={(valid) =>
                  handleValidity('joinDistanceMm', '端点結合距離', valid)
                }
              />
            </div>

            <FillSettingsPanel
              settings={fillSettings}
              onSettingsChange={onFillSettingsChange}
              onInvalidFieldsChange={onFillInvalidChange}
            />
          </div>

          <div
            role="tabpanel"
            className="settings-tabpanel"
            hidden={activeTab !== 'gcode'}
          >
            <GcodeSettingsPanel
              settings={gcodeSettings}
              onSettingsChange={onGcodeSettingsChange}
              onInvalidFieldsChange={onGcodeInvalidChange}
            />
          </div>
        </div>
      )}
    </section>
  )
}
