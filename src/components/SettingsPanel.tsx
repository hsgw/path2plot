import { useState } from 'react'
import type { GcodeSettings } from '../types/gcode'
import type { ParseSettings } from '../types/svg'
import { GcodeSettingsPanel } from './GcodeSettingsPanel'

interface SettingsPanelProps {
  fileName: string | null
  settings: ParseSettings
  onFileSelected: (text: string, fileName: string) => void
  onSettingsChange: (settings: ParseSettings) => void
  gcodeSettings: GcodeSettings
  onGcodeSettingsChange: (settings: GcodeSettings) => void
  canDownloadGcode: boolean
  boundsWarningCount: number
  onDownloadGcode: () => void
}

export function SettingsPanel({
  fileName,
  settings,
  onFileSelected,
  onSettingsChange,
  gcodeSettings,
  onGcodeSettingsChange,
  canDownloadGcode,
  boundsWarningCount,
  onDownloadGcode,
}: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(true)

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
        <div className="panel-body">
          <div className="settings-group">
            <label className="settings-file-label">
              SVGファイル
              <input
                type="file"
                accept=".svg,image/svg+xml"
                onChange={handleFileChange}
              />
            </label>
            {fileName && <div className="settings-filename">{fileName}</div>}
          </div>

          <div className="settings-group">
            <label>
              DPI
              <input
                type="number"
                min={1}
                step={1}
                value={settings.dpi}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    dpi: Number(e.target.value) || settings.dpi,
                  })
                }
              />
            </label>
            <label>
              倍率
              <input
                type="number"
                min={0.001}
                step={0.1}
                value={settings.scaleFactor}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    scaleFactor: Number(e.target.value) || settings.scaleFactor,
                  })
                }
              />
            </label>
            <label>
              ベジェ折線化許容誤差(mm)
              <input
                type="number"
                min={0.001}
                step={0.01}
                value={settings.bezierToleranceMm}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    bezierToleranceMm:
                      Number(e.target.value) || settings.bezierToleranceMm,
                  })
                }
              />
            </label>
          </div>

          <GcodeSettingsPanel
            settings={gcodeSettings}
            onSettingsChange={onGcodeSettingsChange}
            canDownload={canDownloadGcode}
            warningCount={boundsWarningCount}
            onDownload={onDownloadGcode}
          />
        </div>
      )}
    </section>
  )
}
