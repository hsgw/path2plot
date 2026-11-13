import {
  LEGACY_DEFAULT_GCODE_SETTINGS,
  PRUSA_PEN_GCODE_SETTINGS,
} from '../core/gcode/types'
import {
  createLegacySettings,
  createDefaultSettings,
  DEFAULT_PATH_OPTIONS,
  LEGACY_DEFAULT_SETTINGS,
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
  /** 未編集の組み込みdefaultを将来のJSON更新へ追従させる比較基準 */
  builtInDefault?: SettingsBundle
}

const STORAGE_KEY = 'path2plot.settingsPresets'
const MIGRATION_KEY = 'path2plot.settingsPresets.initialPresets.v1'
const DEFAULT_FLIP_Y_MIGRATION_KEY = 'path2plot.settingsPresets.defaultFlipY.v1'
const DEFAULT_SETTINGS_MIGRATION_KEY =
  'path2plot.settingsPresets.defaultSettings.v2'
const DEFAULT_ORIGIN_MIGRATION_KEY =
  'path2plot.settingsPresets.defaultOrigin.v3'

const INITIAL_PRESETS: Record<string, SettingsBundle> = {
  default: createDefaultSettings(),
  prusa_pen: createLegacySettings(PRUSA_PEN_GCODE_SETTINGS),
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

function sameSettings(a: unknown, b: unknown): boolean {
  return JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b))
}

const PREVIOUS_DEFAULT_SETTINGS = {
  ...LEGACY_DEFAULT_SETTINGS,
  gcodeSettings: {
    ...LEGACY_DEFAULT_SETTINGS.gcodeSettings,
    drawAccel: 6000,
    travelAccel: 6000,
    bedOriginXMm: 3.25,
    bedOriginYMm: 14.5,
    templates: {
      start: 'PLOT_START\nM204 S{travelAccel}\n',
      travelMove: 'G0 X{x} Y{y} F{travelFeedRate}',
      penDown: 'M204 S{drawAccel}\nPEN_DOWN',
      drawMove: 'G1 X{x} Y{y} F{drawFeedRate}',
      penUp: 'M204 S{travelAccel}\nPEN_UP',
      end: 'PEN_UP\nPLOT_END\n\n',
    },
  },
  fillSettings: {
    ...LEGACY_DEFAULT_SETTINGS.fillSettings,
    spacingMm: 0.35,
    fillOffsetMm: 0.175,
  },
  joinDistanceMm: 0.35,
  penWidthMm: 0.35,
  minStrokeLengthMm: 0.5,
  pathOptions: {
    optimizePaths: true,
    optimizeTravel: true,
    reorderPaths: true,
    reversePaths: true,
    joinPaths: true,
  },
}

const SHIPPED_DEFAULT_SETTINGS = {
  ...PREVIOUS_DEFAULT_SETTINGS,
  gcodeSettings: {
    ...PREVIOUS_DEFAULT_SETTINGS.gcodeSettings,
    bedOriginXMm: 3.5,
    bedOriginYMm: 15.5,
  },
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

function migrateDefaultPreset(store: SettingsStore): void {
  // 以前の移行動作を先に再現する。markerが既にある場合のflipY=falseは編集値として扱う。
  if (localStorage.getItem(DEFAULT_FLIP_Y_MIGRATION_KEY) !== '1') {
    const defaultPreset = store.presets.default
    const settings = defaultPreset?.gcodeSettings
    const { flipY: _oldFlipY, ...oldGcodeSettings } = settings ?? {}
    const { flipY: _legacyFlipY, ...legacyGcodeSettings } =
      LEGACY_DEFAULT_GCODE_SETTINGS
    if (
      settings &&
      settings.flipY !== true &&
      sameSettings(oldGcodeSettings, legacyGcodeSettings)
    ) {
      settings.flipY = true
      writeStore(store)
    }
    localStorage.setItem(DEFAULT_FLIP_Y_MIGRATION_KEY, '1')
  }

  // 旧既定値一式と完全一致するdefaultだけを新しい組み込み値へ移す。
  if (localStorage.getItem(DEFAULT_SETTINGS_MIGRATION_KEY) !== '1') {
    if (sameSettings(store.presets.default, LEGACY_DEFAULT_SETTINGS)) {
      store.presets.default = createDefaultSettings()
      writeStore(store)
    }
    localStorage.setItem(DEFAULT_SETTINGS_MIGRATION_KEY, '1')
  }

  // 前回の組み込み既定値一式と一致する場合だけ、新しい既定値へ移す。
  if (localStorage.getItem(DEFAULT_ORIGIN_MIGRATION_KEY) !== '1') {
    if (sameSettings(store.presets.default, PREVIOUS_DEFAULT_SETTINGS)) {
      store.presets.default = createDefaultSettings()
      writeStore(store)
    }
    localStorage.setItem(DEFAULT_ORIGIN_MIGRATION_KEY, '1')
  }

  refreshBuiltInDefault(store)
}

/** 未編集のdefaultだけ最新のJSON既定値へ追従させる。 */
function refreshBuiltInDefault(store: SettingsStore): void {
  const preset = store.presets.default
  if (!preset) return

  const currentSnapshot = createDefaultSettings()
  if (store.builtInDefault && sameSettings(preset, store.builtInDefault)) {
    let changed = false
    if (!sameSettings(preset, currentSnapshot)) {
      store.presets.default = currentSnapshot
      changed = true
    }
    if (!sameSettings(store.builtInDefault, currentSnapshot)) {
      store.builtInDefault = currentSnapshot
      changed = true
    }
    if (changed) writeStore(store)
  } else if (
    !store.builtInDefault &&
    (sameSettings(preset, currentSnapshot) ||
      sameSettings(preset, SHIPPED_DEFAULT_SETTINGS))
  ) {
    // 初回起動、または既知のリリース既定値から移行した未編集defaultだけ記録する。
    if (!sameSettings(preset, currentSnapshot)) {
      store.presets.default = currentSnapshot
    }
    store.builtInDefault = currentSnapshot
    writeStore(store)
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
          builtInDefault: parsed.builtInDefault,
        }
      : { defaultName: null, presets: {} }

    addInitialPresets(store)
    migrateDefaultPreset(store)
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
  const defaults = LEGACY_DEFAULT_SETTINGS
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
