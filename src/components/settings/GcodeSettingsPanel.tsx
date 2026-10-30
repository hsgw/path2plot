import type { GcodeSettings, GcodeTemplates } from '../../core/gcode/types'
import { InfoHint } from '../common/InfoHint'
import { NumberField } from '../common/NumberField'
import { useInvalidFields } from './useInvalidFields'

interface GcodeSettingsPanelProps {
  settings: GcodeSettings
  onSettingsChange: (settings: GcodeSettings) => void
  onInvalidFieldsChange: (labels: string[]) => void
}

/** テンプレート以外の設定項目(すべて数値)のキー */
type NumberSettingKey = keyof Omit<GcodeSettings, 'templates' | 'flipY'>

const TEMPLATE_LABELS: { key: keyof GcodeTemplates; label: string }[] = [
  { key: 'start', label: '開始' },
  { key: 'travelMove', label: '移動' },
  { key: 'penDown', label: 'ペンダウン' },
  { key: 'drawMove', label: '描画' },
  { key: 'penUp', label: 'ペンアップ' },
  { key: 'end', label: '終了' },
]

/**
 * テンプレートで使える変数の一覧。キー名はGcodeSettingsの数値項目名と一致させている
 * (generate.ts参照)。{x}{y}のみ例外で、移動(G00)/描画(G01)テンプレート限定の移動先座標
 * (それ以外のテンプレートでは未定義のまま残る)。それ以外は全テンプレート共通で同じ値を指す。
 */
const TEMPLATE_VARS: { key: string; label: string }[] = [
  { key: 'x', label: '移動先X(移動/描画のみ)' },
  { key: 'y', label: '移動先Y(移動/描画のみ)' },
  { key: 'drawFeedRate', label: '描画速度' },
  { key: 'travelFeedRate', label: '移動速度' },
  { key: 'penFeedRate', label: 'ペン上下速度' },
  { key: 'penDownZ', label: 'ペンダウンZ' },
  { key: 'penUpZ', label: 'ペンアップZ' },
  { key: 'travelZ', label: 'トラベルZ' },
  { key: 'drawAccel', label: '描画加速度' },
  { key: 'travelAccel', label: '移動加速度' },
  { key: 'xyJerk', label: 'XYジャーク' },
  { key: 'minSegmentLengthMm', label: '最小セグメント長' },
  { key: 'bedWidthMm', label: '描画可能領域 幅' },
  { key: 'bedHeightMm', label: '描画可能領域 高さ' },
  { key: 'bedOriginXMm', label: '原点X' },
  { key: 'bedOriginYMm', label: '原点Y' },
  { key: 'parkX', label: 'パーク位置X' },
  { key: 'parkY', label: 'パーク位置Y' },
]

export function GcodeSettingsPanel({
  settings,
  onSettingsChange,
  onInvalidFieldsChange,
}: GcodeSettingsPanelProps) {
  const { setValidity } = useInvalidFields(onInvalidFieldsChange)

  const updateTemplate = (key: keyof GcodeTemplates, value: string): void =>
    onSettingsChange({
      ...settings,
      templates: { ...settings.templates, [key]: value },
    })

  const numberField = (
    label: string,
    key: NumberSettingKey,
    step = 1,
    hint?: string,
  ) => (
    <NumberField
      label={label}
      value={settings[key]}
      step={step}
      hint={hint}
      onCommit={(value) => onSettingsChange({ ...settings, [key]: value })}
      onValidityChange={(valid) => setValidity(key, label, valid)}
    />
  )

  return (
    <>
      <div className="settings-group">
        <h3>描画可能領域</h3>
        {numberField('幅(mm)', 'bedWidthMm', 0.1)}
        {numberField('高さ(mm)', 'bedHeightMm', 0.1)}
      </div>

      <div className="settings-group">
        <h3>
          <InfoHint text="原点は描画可能領域のローカル座標(0,0)に対応する機械絶対座標。実機の原点と紙・治具の位置がズレる場合はここで補正する">
            原点
          </InfoHint>
        </h3>
        {numberField('X(mm)', 'bedOriginXMm', 0.1)}
        {numberField('Y(mm)', 'bedOriginYMm', 0.1)}
        <label className="settings-checkbox-label">
          <input
            type="checkbox"
            checked={settings.flipY ?? false}
            onChange={(e) =>
              onSettingsChange({ ...settings, flipY: e.target.checked })
            }
          />
          Y座標を上下反転
        </label>
      </div>

      <div className="settings-group">
        <h3>
          <InfoHint text="パーク位置は機体可動域チェックの対象外です。安全な座標か確認してください">
            パーク位置
          </InfoHint>
        </h3>
        {numberField('X(mm)', 'parkX', 0.1)}
        {numberField('Y(mm)', 'parkY', 0.1)}
      </div>

      <div className="settings-group">
        <h3>
          <InfoHint text="連続する点の間隔がこの値未満になる中間点を間引きます(0で無効)。始点・終点は必ず保持されます。微小セグメントによる減速を防ぐための設定です">
            最小セグメント長
          </InfoHint>
        </h3>
        {numberField('mm', 'minSegmentLengthMm', 0.01)}
      </div>

      <div className="settings-group">
        <h3>G-code設定</h3>
        {numberField('描画速度 F(mm/min)', 'drawFeedRate')}
        {numberField('移動速度 F(mm/min)', 'travelFeedRate')}
        {numberField('ペン上下速度 F(mm/min)', 'penFeedRate')}
        {numberField('ペンダウンZ(mm)', 'penDownZ', 0.1)}
        {numberField('ペンアップZ(mm)', 'penUpZ', 0.1)}
        {numberField('トラベルZ(mm)', 'travelZ', 0.1)}
        {numberField('描画加速度 M204 P', 'drawAccel')}
        {numberField('移動加速度 M204 T', 'travelAccel')}
        {numberField(
          'XYジャーク M205 X/Y',
          'xyJerk',
          0.1,
          '加速度・XYジャークの値は実機確認待ちの暫定値です',
        )}
      </div>

      <div className="settings-group">
        <h3>テンプレート</h3>
        <details className="gcode-template-vars-details">
          <summary>テンプレートで使える変数</summary>
          <table className="gcode-template-vars">
            <tbody>
              {TEMPLATE_VARS.map(({ key, label }) => (
                <tr key={key}>
                  <td>{`{${key}}`}</td>
                  <td>{label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        {TEMPLATE_LABELS.map(({ key, label }) => (
          <label key={key}>
            {label}
            <textarea
              className="settings-template-textarea"
              value={settings.templates[key]}
              onChange={(e) => updateTemplate(key, e.target.value)}
            />
          </label>
        ))}
      </div>
    </>
  )
}
