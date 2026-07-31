import { useEffect, useState } from 'react'
import type { GcodeSettings, GcodeTemplates } from '../types/gcode'
import { NumberField } from './NumberField'

interface GcodeSettingsPanelProps {
  settings: GcodeSettings
  onSettingsChange: (settings: GcodeSettings) => void
  onInvalidFieldsChange: (labels: string[]) => void
}

export function GcodeSettingsPanel({
  settings,
  onSettingsChange,
  onInvalidFieldsChange,
}: GcodeSettingsPanelProps) {
  const [invalidFields, setInvalidFields] = useState<Map<string, string>>(
    new Map(),
  )

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

  const updateTemplate = (key: keyof GcodeTemplates, value: string): void =>
    onSettingsChange({
      ...settings,
      templates: { ...settings.templates, [key]: value },
    })

  const numberField = (
    label: string,
    key: keyof Omit<GcodeSettings, 'templates'>,
    step = 1,
  ) => (
    <NumberField
      label={label}
      value={settings[key]}
      step={step}
      onCommit={(value) => onSettingsChange({ ...settings, [key]: value })}
      onValidityChange={(valid) => handleValidity(key, label, valid)}
    />
  )

  return (
    <>
      <div className="settings-group">
        <h3>G-code設定(FR-31/32)</h3>
        {numberField('描画速度 F(mm/min)', 'drawFeedRate')}
        {numberField('移動速度 F(mm/min)', 'travelFeedRate')}
        {numberField('ペン上下速度 F(mm/min)', 'penFeedRate')}
        {numberField('ペンダウンZ(mm)', 'penDownZ', 0.1)}
        {numberField('ペンアップZ(mm)', 'penUpZ', 0.1)}
        {numberField('トラベルZ(mm)', 'travelZ', 0.1)}
        {numberField('描画加速度 M204 P', 'drawAccel')}
        {numberField('移動加速度 M204 T', 'travelAccel')}
        {numberField('XYジャーク M205 X/Y', 'xyJerk', 0.1)}
        <p className="settings-hint">
          加速度・XYジャークの値は実機確認待ちの暫定値です(OQ-8)
        </p>
        {numberField('最小セグメント長(mm)', 'minSegmentLengthMm', 0.01)}
      </div>

      <div className="settings-group">
        <h3>描画可能領域(FR-35)</h3>
        {numberField('幅(mm)', 'bedWidthMm', 0.1)}
        {numberField('高さ(mm)', 'bedHeightMm', 0.1)}
        <p className="settings-hint">
          原点は描画可能領域のローカル座標(0,0)に対応する機械絶対座標。実機のG28
          W後の原点と紙・治具の位置がズレる場合はここで補正する
        </p>
        {numberField('原点X(mm)', 'bedOriginXMm', 0.1)}
        {numberField('原点Y(mm)', 'bedOriginYMm', 0.1)}
      </div>

      <div className="settings-group">
        <h3>パーク位置(FR-30)</h3>
        <p className="settings-hint">
          パーク位置は機体可動域チェックの対象外です。安全な座標か確認してください
        </p>
        {numberField('X(mm)', 'parkX', 0.1)}
        {numberField('Y(mm)', 'parkY', 0.1)}
      </div>

      <div className="settings-group">
        <h3>テンプレートgcode(FR-30/32)</h3>
        <label>
          開始
          <textarea
            className="settings-template-textarea"
            value={settings.templates.start}
            onChange={(e) => updateTemplate('start', e.target.value)}
          />
        </label>
        <label>
          ペンダウン
          <textarea
            className="settings-template-textarea"
            value={settings.templates.penDown}
            onChange={(e) => updateTemplate('penDown', e.target.value)}
          />
        </label>
        <label>
          ペンアップ
          <textarea
            className="settings-template-textarea"
            value={settings.templates.penUp}
            onChange={(e) => updateTemplate('penUp', e.target.value)}
          />
        </label>
        <label>
          終了
          <textarea
            className="settings-template-textarea"
            value={settings.templates.end}
            onChange={(e) => updateTemplate('end', e.target.value)}
          />
        </label>
      </div>
    </>
  )
}
