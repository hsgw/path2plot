import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteSettingsPreset,
  getDefaultSettingsPresetName,
  listSettingsPresetNames,
  loadDefaultSettingsPreset,
  loadSettingsPreset,
} from '../../app/settingsStorage'
import { DEFAULT_GCODE_SETTINGS, PRUSA_PEN_GCODE_SETTINGS } from './types'

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
      joinDistanceMm: 0.5,
      penWidthMm: 0,
    })
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

  it('旧default初期値だけをflipYオンへ移行し、編集済み設定と旧Prusaは保持する', () => {
    const { flipY: _flipY, ...oldDefaultSettings } = DEFAULT_GCODE_SETTINGS
    const { flipY: _prusaFlipY, ...oldPrusaSettings } = PRUSA_PEN_GCODE_SETTINGS
    memory.set(
      'path2plot.settingsPresets',
      JSON.stringify({
        defaultName: 'default',
        presets: {
          default: { gcodeSettings: { ...oldDefaultSettings, flipY: false } },
          custom: { gcodeSettings: { ...oldDefaultSettings, bedWidthMm: 123 } },
          prusa_pen: { gcodeSettings: oldPrusaSettings },
        },
      }),
    )
    memory.set('path2plot.settingsPresets.initialPresets.v1', '1')

    expect(loadSettingsPreset('default')?.gcodeSettings.flipY).toBe(true)
    expect(loadSettingsPreset('custom')?.gcodeSettings.flipY).toBe(false)
    expect(loadSettingsPreset('prusa_pen')?.gcodeSettings.flipY).toBe(false)
  })
})
