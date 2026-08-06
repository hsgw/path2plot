import type {
  FillSettings,
  HatchConnectMode,
  HatchWaveform,
} from '../../core/fill/types'
import { InfoHint } from '../common/InfoHint'
import { NumberField } from '../common/NumberField'
import type { InvalidFieldsApi } from './useInvalidFields'

interface HatchSettingsFieldsProps {
  settings: FillSettings
  /** 変更されたフィールドだけを渡す(呼び出し側が現在値へのマージを担う) */
  onSettingsChange: (patch: Partial<FillSettings>) => void
  setValidity: InvalidFieldsApi['setValidity']
}

/** FR-17/18: ハッチ方式(pattern==='hatch')でのみ表示する設定項目 */
export function HatchSettingsFields({
  settings,
  onSettingsChange,
  setValidity,
}: HatchSettingsFieldsProps) {
  const update = onSettingsChange

  return (
    <>
      <label className="settings-checkbox-label">
        <input
          type="checkbox"
          checked={settings.crossHatch}
          onChange={(e) => update({ crossHatch: e.target.checked })}
        />
        クロスハッチ(2方向を重ねる)
      </label>
      {settings.crossHatch && (
        <NumberField
          label="第2方向の角度(度)"
          value={settings.crossAngleDeg}
          step={1}
          onCommit={(crossAngleDeg) => update({ crossAngleDeg })}
          onValidityChange={(valid) =>
            setValidity('crossAngleDeg', '第2方向の角度', valid)
          }
        />
      )}

      <NumberField
        label="ハッチ線の最小長さ(mm)"
        value={settings.minHatchLineLengthMm}
        min={0}
        step={0.1}
        hint="始点-終点の直線距離がこの長さ未満のハッチ線を除外します(0で無効)。「連結しない」「往復」は接続前の個々のハッチ線を対象に、「ジグザグ」は行の端点だけで接続するため接続後の結果を対象に判定します"
        onCommit={(minHatchLineLengthMm) => update({ minHatchLineLengthMm })}
        onValidityChange={(valid) =>
          setValidity('minHatchLineLengthMm', 'ハッチ線の最小長さ', valid)
        }
      />

      <label>
        {settings.connect === 'zigzag' ? (
          <InfoHint text="各行の左右の端点を交互に拾い、斜めに繋いだ一筆書きを描きます(L0→R1→L2→R3…)。ハッチ線そのものは描かれません。戻り線が行間を通るため、実際の線密度は線間隔から想像されるより高くなります。塗り領域の外へ出る接続は行わず、その位置で線を分けます">
            ハッチ線の連結
          </InfoHint>
        ) : (
          <span className="field-label">ハッチ線の連結</span>
        )}
        <select
          value={settings.connect}
          onChange={(e) =>
            update({ connect: e.target.value as HatchConnectMode })
          }
        >
          <option value="none">連結しない</option>
          <option value="zigzag">ジグザグ</option>
          <option value="boustrophedon">往復</option>
        </select>
      </label>
      {settings.connect === 'boustrophedon' && (
        <NumberField
          label="接続距離の上限(線間隔に対する倍率)"
          value={settings.connectDistanceFactor}
          min={0.1}
          step={0.5}
          hint="ハッチ線を描いた上で、隣接行の同じ側の端点同士を繋いで往復させます。端点同士の移動は輪郭(塗りオフセットを設定している場合はオフセット後の輪郭)をなぞる場合のみ行い、輪郭を辿れない位置(穴の境界と外形をまたぐ場合など)や一度なぞった輪郭へは繋がずに線を分けます。上限は端点までの直線距離に対するもので、リスト上の次のラインへの接続だけは上限を超えても許容します"
          onCommit={(connectDistanceFactor) =>
            update({ connectDistanceFactor })
          }
          onValidityChange={(valid) =>
            setValidity('connectDistanceFactor', '接続距離の上限', valid)
          }
        />
      )}

      {settings.connect !== 'zigzag' && (
        <>
          <label>
            線の形状
            <select
              value={settings.waveform}
              onChange={(e) =>
                update({ waveform: e.target.value as HatchWaveform })
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
                hint="振幅は隣接行と干渉しないよう、線間隔の半分を上限として自動的に抑えられます"
                onCommit={(waveAmplitudeMm) => update({ waveAmplitudeMm })}
                onValidityChange={(valid) =>
                  setValidity('waveAmplitudeMm', '振幅', valid)
                }
              />
              <NumberField
                label="波長(mm)"
                value={settings.waveLengthMm}
                min={0.01}
                step={0.1}
                onCommit={(waveLengthMm) => update({ waveLengthMm })}
                onValidityChange={(valid) =>
                  setValidity('waveLengthMm', '波長', valid)
                }
              />
              {settings.waveform === 'sine' && (
                <NumberField
                  label="1周期あたりの分割数"
                  value={settings.waveSegmentsPerCycle}
                  min={2}
                  step={1}
                  onCommit={(waveSegmentsPerCycle) =>
                    update({ waveSegmentsPerCycle })
                  }
                  onValidityChange={(valid) =>
                    setValidity(
                      'waveSegmentsPerCycle',
                      '1周期あたりの分割数',
                      valid,
                    )
                  }
                />
              )}
            </>
          )}
        </>
      )}
    </>
  )
}
