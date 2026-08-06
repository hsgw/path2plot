import { useState } from 'react'
import {
  getShowHelpOnStartup,
  setShowHelpOnStartup,
  type SettingsBundle,
} from '../../app/settingsStorage'
import type { FillSettings } from '../../core/fill/types'
import type { GcodeSettings } from '../../core/gcode/types'
import type { ParseSettings } from '../../core/svg/types'
import { HelpDialog } from '../common/HelpDialog'
import { InfoHint } from '../common/InfoHint'
import { NumberField } from '../common/NumberField'
import { FillSettingsPanel } from './FillSettingsPanel'
import { GcodeSettingsPanel } from './GcodeSettingsPanel'
import { SettingsActions } from './SettingsActions'
import { useInvalidFields } from './useInvalidFields'

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
  /** ペン先の太さ(mm)。0=未入力 */
  penWidthMm: number
  onPenWidthChange: (penWidthMm: number) => void
  onJoinPaths: () => void
  onOptimize: () => void
  onResetAll: () => void
  hasEntries: boolean
  fillSettings: FillSettings
  onFillSettingsChange: (patch: Partial<FillSettings>) => void
  onFillInvalidChange: (labels: string[]) => void
  canDownloadGcode: boolean
  boundsWarningCount: number
  onDownloadGcode: () => void
  /** 現在の設定一式(保存ダイアログで使う) */
  settingsBundle: SettingsBundle
  /** プリセットをロードした結果を各設定へ反映する */
  onLoadSettingsBundle: (bundle: SettingsBundle) => void
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
  penWidthMm,
  onPenWidthChange,
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
  settingsBundle,
  onLoadSettingsBundle,
}: SettingsPanelProps) {
  // 設定項目はSVG読み込み系(読み込み・パス結合・塗りつぶし)とG-code出力系の2タブに分ける。
  // 非表示側のタブもDOM上には残す(hidden属性)ことで、入力途中の値や不正値の報告状態が
  // タブ切り替えでリセットされないようにする
  const [activeTab, setActiveTab] = useState<'svg' | 'gcode'>('svg')
  // 「起動時にこのポップアップを表示する」がオンの間、起動時に自動で開く
  const [isHelpOpen, setIsHelpOpen] = useState(getShowHelpOnStartup)
  const [showHelpOnStartup, setShowHelpOnStartupState] =
    useState(getShowHelpOnStartup)
  const { setValidity } = useInvalidFields(onSettingsInvalidChange)

  return (
    <section className="panel panel-settings">
      <div className="panel-header">
        <h2>path2plot</h2>
        <button type="button" onClick={() => setIsHelpOpen(true)}>
          使い方
        </button>
      </div>
      {isHelpOpen && (
        <HelpDialog
          onClose={() => setIsHelpOpen(false)}
          showOnStartup={showHelpOnStartup}
          onShowOnStartupChange={(value) => {
            setShowHelpOnStartupState(value)
            setShowHelpOnStartup(value)
          }}
        />
      )}
      <div className="panel-body panel-body-settings">
        <SettingsActions
          onFileSelected={onFileSelected}
          onJoinPaths={onJoinPaths}
          onOptimize={onOptimize}
          onResetAll={onResetAll}
          hasEntries={hasEntries}
          canDownloadGcode={canDownloadGcode}
          boundsWarningCount={boundsWarningCount}
          onDownloadGcode={onDownloadGcode}
          settingsBundle={settingsBundle}
          onLoadSettingsBundle={onLoadSettingsBundle}
        />

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
              onValidityChange={(valid) => setValidity('dpi', 'DPI', valid)}
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
                setValidity('scaleFactor', '倍率', valid)
              }
            />
            <h3 className="settings-subheading">
              <InfoHint text="読み込んだSVG全体の配置位置をプリンタ座標系上でX/Y方向にずらす">
                配置オフセット
              </InfoHint>
            </h3>
            <NumberField
              label="X(mm)"
              value={settings.offsetXMm}
              step={1}
              onCommit={(offsetXMm) =>
                onSettingsChange({ ...settings, offsetXMm })
              }
              onValidityChange={(valid) =>
                setValidity('offsetXMm', '配置オフセットX', valid)
              }
            />
            <NumberField
              label="Y(mm)"
              value={settings.offsetYMm}
              step={1}
              onCommit={(offsetYMm) =>
                onSettingsChange({ ...settings, offsetYMm })
              }
              onValidityChange={(valid) =>
                setValidity('offsetYMm', '配置オフセットY', valid)
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
                setValidity('bezierToleranceMm', 'ベジェ折線化許容誤差', valid)
              }
            />
          </div>

          <div className="settings-group">
            <h3>ペン設定</h3>
            <NumberField
              label="ペン先の太さ(mm)"
              value={penWidthMm}
              min={0}
              step={0.1}
              hint="0の場合は未入力として扱われます。変更した瞬間に、結合距離・塗りの線間隔・塗りオフセットへ一度だけ反映されます(以降はそれぞれ個別に編集できます)"
              onCommit={onPenWidthChange}
              onValidityChange={(valid) =>
                setValidity('penWidthMm', 'ペン先の太さ', valid)
              }
            />
          </div>

          <div className="settings-group">
            <h3>パス結合</h3>
            <NumberField
              label="端点結合距離(mm)"
              value={joinDistanceMm}
              min={0}
              step={0.1}
              onCommit={onJoinDistanceChange}
              onValidityChange={(valid) =>
                setValidity('joinDistanceMm', '端点結合距離', valid)
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
    </section>
  )
}
