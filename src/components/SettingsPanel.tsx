import { useEffect, useState } from 'react'
import type { GcodeSettings } from '../types/gcode'
import type { ParseSettings } from '../types/svg'
import { GcodeSettingsPanel } from './GcodeSettingsPanel'
import { NumberField } from './NumberField'

interface SettingsPanelProps {
  fileName: string | null
  settings: ParseSettings
  onFileSelected: (text: string, fileName: string) => void
  onSettingsChange: (settings: ParseSettings) => void
  onSettingsInvalidChange: (labels: string[]) => void
  gcodeSettings: GcodeSettings
  onGcodeSettingsChange: (settings: GcodeSettings) => void
  onGcodeInvalidChange: (labels: string[]) => void
  canDownloadGcode: boolean
  boundsWarningCount: number
  onDownloadGcode: () => void
}

export function SettingsPanel({
  fileName,
  settings,
  onFileSelected,
  onSettingsChange,
  onSettingsInvalidChange,
  gcodeSettings,
  onGcodeSettingsChange,
  onGcodeInvalidChange,
  canDownloadGcode,
  boundsWarningCount,
  onDownloadGcode,
}: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [invalidFields, setInvalidFields] = useState<Map<string, string>>(
    new Map(),
  )

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
            <NumberField
              label="DPI"
              value={settings.dpi}
              min={1}
              step={1}
              onCommit={(dpi) => onSettingsChange({ ...settings, dpi })}
              onValidityChange={(valid) => handleValidity('dpi', 'DPI', valid)}
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

          <GcodeSettingsPanel
            settings={gcodeSettings}
            onSettingsChange={onGcodeSettingsChange}
            onInvalidFieldsChange={onGcodeInvalidChange}
            canDownload={canDownloadGcode}
            warningCount={boundsWarningCount}
            onDownload={onDownloadGcode}
          />
        </div>
      )}
    </section>
  )
}
