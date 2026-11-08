import {
  DEFAULT_GCODE_SETTINGS,
  PRUSA_PEN_GCODE_SETTINGS,
} from '../core/gcode/types'
import {
  createDefaultSettings,
  DEFAULT_PATH_OPTIONS,
  type SettingsBundle,
} from '../core/settingsFile'

export type { SettingsBundle } from '../core/settingsFile'

type StoredSettingsBundle = Omit<
  SettingsBundle,
  'minStrokeLengthMm' | 'pathOptions'
> &
  Partial<Pick<SettingsBundle, 'minStrokeLengthMm' | 'pathOptions'>>

interface SettingsStore {
  /** 起動時に自動ロードするプリセット名。未設定ならnull */
  defaultName: string | null
  presets: Record<string, StoredSettingsBundle>
}

const STORAGE_KEY = 'path2plot.settingsPresets'
const MIGRATION_KEY = 'path2plot.settingsPresets.initialPresets.v1'
const DEFAULT_FLIP_Y_MIGRATION_KEY = 'path2plot.settingsPresets.defaultFlipY.v1'

const INITIAL_PRESETS: Record<string, SettingsBundle> = {
  default: createDefaultSettings(),
  prusa_pen: createDefaultSettings(PRUSA_PEN_GCODE_SETTINGS),
}

function addInitialPresets(store: SettingsStore): void {
  // 一度だけ不足分を追加する。既存の同名プリセットとデフォルト選択は保持し、
  // マーカーでユーザーが削除した初期プリセットを次回以降に復活させない。
  if (localStorage.getItem(MIGRATION_KEY) !== '1') {
    for (const [name, bundle] of Object.entries(INITIAL_PRESETS)) {
      if (!(name in store.presets)) store.presets[name] = bundle
    }
    if (!store.defaultName) store.defaultName = 'default'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    localStorage.setItem(MIGRATION_KEY, '1')
  }
}

function migrateDefaultFlipY(store: SettingsStore): void {
  // 既存の default が旧既定値のままなら新しい座標系設定へ移行する。
  // 他の値が変わっている場合はユーザー編集とみなし、そのまま保持する。
  if (localStorage.getItem(DEFAULT_FLIP_Y_MIGRATION_KEY) !== '1') {
    const defaultPreset = store.presets.default
    const settings = defaultPreset?.gcodeSettings
    const { flipY: _flipY, ...currentSettings } = DEFAULT_GCODE_SETTINGS
    const { flipY: previousFlipY, ...previousSettings } = settings ?? {}
    if (
      settings &&
      previousFlipY !== true &&
      JSON.stringify(previousSettings) === JSON.stringify(currentSettings)
    ) {
      settings.flipY = true
      writeStore(store)
    }
    localStorage.setItem(DEFAULT_FLIP_Y_MIGRATION_KEY, '1')
  }
}

function readStore(): SettingsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<SettingsStore>) : null
    const store: SettingsStore = parsed
      ? {
          defaultName: parsed.defaultName ?? null,
          presets: parsed.presets ?? {},
        }
      : { defaultName: null, presets: {} }

    addInitialPresets(store)
    migrateDefaultFlipY(store)
    return store
  } catch {
    return { defaultName: null, presets: {} }
  }
}

function writeStore(store: SettingsStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // 保存先(localStorage)が使えない環境(プライベートブラウズ等)では無視する
  }
}

export function listSettingsPresetNames(): string[] {
  return Object.keys(readStore().presets).sort((a, b) => a.localeCompare(b))
}

export function getDefaultSettingsPresetName(): string | null {
  return readStore().defaultName
}

/**
 * 名前を付けて設定を保存する。asDefault=trueなら起動時自動ロード対象にする。
 * まだ1件も保存されていない場合は、初回保存を自動的にデフォルト扱いにする
 * (デフォルトが1件も無いと自動ロードの仕組みが機能しないため)
 */
export function saveSettingsPreset(
  name: string,
  bundle: SettingsBundle,
  asDefault: boolean,
): void {
  const store = readStore()
  store.presets[name] = bundle
  if (asDefault || store.defaultName === null) store.defaultName = name
  writeStore(store)
}

export function loadSettingsPreset(name: string): SettingsBundle | null {
  const preset = readStore().presets[name]
  return preset ? normalizePreset(preset) : null
}

export function loadDefaultSettingsPreset(): SettingsBundle | null {
  const store = readStore()
  if (store.defaultName === null) return null
  const preset = store.presets[store.defaultName]
  return preset ? normalizePreset(preset) : null
}

/** 古い保存済みプリセットに追加設定がない場合は従来値(OFF)へ補完する */
function normalizePreset(preset: StoredSettingsBundle): SettingsBundle {
  const defaults = createDefaultSettings()
  return {
    ...defaults,
    ...preset,
    parseSettings: { ...defaults.parseSettings, ...preset.parseSettings },
    fillSettings: { ...defaults.fillSettings, ...preset.fillSettings },
    minStrokeLengthMm: preset.minStrokeLengthMm ?? defaults.minStrokeLengthMm,
    pathOptions: { ...DEFAULT_PATH_OPTIONS, ...preset.pathOptions },
    gcodeSettings: {
      ...defaults.gcodeSettings,
      ...preset.gcodeSettings,
      templates: {
        ...defaults.gcodeSettings.templates,
        ...preset.gcodeSettings?.templates,
      },
      flipY: preset.gcodeSettings?.flipY ?? false,
    },
  }
}

export function setDefaultSettingsPresetName(name: string): void {
  const store = readStore()
  if (!(name in store.presets)) return
  store.defaultName = name
  writeStore(store)
}

export function deleteSettingsPreset(name: string): void {
  const store = readStore()
  if (!(name in store.presets)) return
  delete store.presets[name]
  if (store.defaultName === name) store.defaultName = null
  writeStore(store)
}

const SHOW_HELP_ON_STARTUP_KEY = 'path2plot.showHelpOnStartup'

/**
 * 「使い方」ポップアップの「起動時にこのポップアップを表示する」チェックボックスの状態。
 * 起動時にこのポップアップを自動表示するかどうかはこの値のみで判断する(初回判定はしない)。
 * 未設定(初回)の場合は表示する
 */
export function getShowHelpOnStartup(): boolean {
  try {
    return localStorage.getItem(SHOW_HELP_ON_STARTUP_KEY) !== '0'
  } catch {
    return true
  }
}

export function setShowHelpOnStartup(value: boolean): void {
  try {
    if (value) localStorage.removeItem(SHOW_HELP_ON_STARTUP_KEY)
    else localStorage.setItem(SHOW_HELP_ON_STARTUP_KEY, '0')
  } catch {
    // 保存先(localStorage)が使えない環境(プライベートブラウズ等)では無視する
  }
}
