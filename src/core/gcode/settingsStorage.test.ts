import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteSettingsPreset,
  getDefaultSettingsPresetName,
  listSettingsPresetNames,
  loadDefaultSettingsPreset,
  loadSettingsPreset,
} from '../../app/settingsStorage'
import {
  DEFAULT_GCODE_SETTINGS,
  LEGACY_DEFAULT_GCODE_SETTINGS,
  PRUSA_PEN_GCODE_SETTINGS,
} from './types'
import { createDefaultSettings, LEGACY_DEFAULT_SETTINGS } from '../settingsFile'

const memory = new Map<string, string>()
const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
  clear: () => memory.clear(),
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})

afterEach(() => localStorageMock.clear())

describe('settings preset initialization', () => {
  it('初回にdefaultと従来Prusa設定を追加しdefaultを選択する', () => {
    expect(listSettingsPresetNames()).toEqual(['default', 'prusa_pen'])
    expect(getDefaultSettingsPresetName()).toBe('default')
    expect(loadDefaultSettingsPreset()?.gcodeSettings).toEqual(
      DEFAULT_GCODE_SETTINGS,
    )
    expect(loadSettingsPreset('prusa_pen')?.gcodeSettings).toEqual(
      PRUSA_PEN_GCODE_SETTINGS,
    )
    expect(loadSettingsPreset('default')).toMatchObject({
      joinDistanceMm: 0.35,
      penWidthMm: 0.35,
      minStrokeLengthMm: 0.5,
      fillSettings: { spacingMm: 0.35, fillOffsetMm: 0.175 },
      pathOptions: {
        reorderPaths: true,
        reversePaths: true,
        joinPaths: true,
      },
    })
  })

  it('旧形式の保存済みプリセットでは通常ストローク最小長を0に補完する', () => {
    memory.set(
      'path2plot.settingsPresets',
      JSON.stringify({
        defaultName: 'old',
        presets: {
          old: {
            parseSettings: {},
            gcodeSettings: {},
            fillSettings: {},
            joinDistanceMm: 0.5,
            penWidthMm: 0,
          },
        },
      }),
    )
    memory.set('path2plot.settingsPresets.initialPresets.v1', '1')
    expect(loadSettingsPreset('old')?.minStrokeLengthMm ?? 0).toBe(0)
  })

  it('既存プリセットと既定選択を保持し、不足プリセットだけ追加する', () => {
    const existing = {
      defaultName: 'mine',
      presets: {
        mine: {
          parseSettings: {},
          gcodeSettings: {},
          fillSettings: {},
          joinDistanceMm: 9,
          penWidthMm: 2,
        },
        default: { marker: 'keep' },
      },
    }
    memory.set('path2plot.settingsPresets', JSON.stringify(existing))

    expect(getDefaultSettingsPresetName()).toBe('mine')
    expect(
      JSON.parse(memory.get('path2plot.settingsPresets')!).presets.default,
    ).toEqual({ marker: 'keep' })
    expect(listSettingsPresetNames()).toEqual(['default', 'mine', 'prusa_pen'])
  })

  it('初期プリセット削除後に再読込しても復活しない', () => {
    expect(listSettingsPresetNames()).toContain('prusa_pen')
    deleteSettingsPreset('prusa_pen')

    expect(listSettingsPresetNames()).not.toContain('prusa_pen')
  })

  it('旧defaultのflipY移行を維持し、その後の組み込み既定値移行を行う', () => {
    const { flipY: _flipY, ...oldDefaultSettings } =
      LEGACY_DEFAULT_GCODE_SETTINGS
    const { flipY: _prusaFlipY, ...oldPrusaSettings } = PRUSA_PEN_GCODE_SETTINGS
    memory.set(
      'path2plot.settingsPresets',
      JSON.stringify({
        defaultName: 'default',
        presets: {
          default: {
            ...LEGACY_DEFAULT_SETTINGS,
            gcodeSettings: { ...oldDefaultSettings, flipY: false },
          },
          custom: {
            ...LEGACY_DEFAULT_SETTINGS,
            gcodeSettings: { ...oldDefaultSettings, bedWidthMm: 123 },
          },
          prusa_pen: { gcodeSettings: oldPrusaSettings },
        },
      }),
    )
    memory.set('path2plot.settingsPresets.initialPresets.v1', '1')

    expect(loadSettingsPreset('default')?.gcodeSettings).toEqual(
      DEFAULT_GCODE_SETTINGS,
    )
    expect(loadSettingsPreset('custom')?.gcodeSettings.flipY).toBe(false)
    expect(loadSettingsPreset('prusa_pen')?.gcodeSettings.flipY).toBe(false)
  })

  it('キー順が違っても未編集の旧defaultだけ移行し、編集済み項目は保持する', () => {
    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeys)
      if (value !== null && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([k, v]) => [k, reverseKeys(v)]),
        )
      return value
    }
    memory.set(
      'path2plot.settingsPresets',
      JSON.stringify({
        defaultName: 'default',
        presets: {
          default: reverseKeys(LEGACY_DEFAULT_SETTINGS),
          custom: { ...LEGACY_DEFAULT_SETTINGS, joinDistanceMm: 7 },
        },
      }),
    )
    memory.set('path2plot.settingsPresets.initialPresets.v1', '1')
    memory.set('path2plot.settingsPresets.defaultFlipY.v1', '1')

    expect(loadSettingsPreset('default')?.gcodeSettings).toEqual(
      DEFAULT_GCODE_SETTINGS,
    )
    expect(loadSettingsPreset('custom')?.joinDistanceMm).toBe(7)
  })

  it('以前のflipY migration marker後のfalseはユーザー値として保持する', () => {
    const modified = {
      ...LEGACY_DEFAULT_SETTINGS,
      gcodeSettings: { ...LEGACY_DEFAULT_SETTINGS.gcodeSettings, flipY: false },
    }
    memory.set(
      'path2plot.settingsPresets',
      JSON.stringify({
        defaultName: 'default',
        presets: { default: modified },
      }),
    )
    memory.set('path2plot.settingsPresets.initialPresets.v1', '1')
    memory.set('path2plot.settingsPresets.defaultFlipY.v1', '1')

    expect(loadSettingsPreset('default')?.gcodeSettings.flipY).toBe(false)
    expect(loadSettingsPreset('default')?.gcodeSettings.drawAccel).toBe(7000)
  })

  it('旧組み込みdefaultの完全一致だけ原点を更新し、変更済みdefaultは保持する', () => {
    const previousDefault = createDefaultSettings()
    previousDefault.gcodeSettings.bedOriginXMm = 3.25
    previousDefault.gcodeSettings.bedOriginYMm = 14.5
    const editedDefault = {
      ...previousDefault,
      gcodeSettings: { ...previousDefault.gcodeSettings, bedOriginXMm: 4 },
    }
    memory.set(
      'path2plot.settingsPresets',
      JSON.stringify({
        defaultName: 'default',
        presets: { default: previousDefault, edited: editedDefault },
      }),
    )
    memory.set('path2plot.settingsPresets.initialPresets.v1', '1')
    memory.set('path2plot.settingsPresets.defaultFlipY.v1', '1')
    memory.set('path2plot.settingsPresets.defaultSettings.v2', '1')

    expect(loadSettingsPreset('default')?.gcodeSettings.bedOriginXMm).toBe(3.5)
    expect(loadSettingsPreset('default')?.gcodeSettings.bedOriginYMm).toBe(15.5)
    expect(loadSettingsPreset('edited')?.gcodeSettings.bedOriginXMm).toBe(4)
  })
})
