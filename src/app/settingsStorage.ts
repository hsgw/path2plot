import type { FillSettings } from '../core/fill/types'
import type { GcodeSettings } from '../core/gcode/types'
import type { ParseSettings } from '../core/svg/types'

/** 保存/ロード対象となる設定一式(現在読み込み中のSVGやストローク並び順は含まない) */
export interface SettingsBundle {
  parseSettings: ParseSettings
  gcodeSettings: GcodeSettings
  fillSettings: FillSettings
  joinDistanceMm: number
  penWidthMm: number
}

interface SettingsStore {
  /** 起動時に自動ロードするプリセット名。未設定ならnull */
  defaultName: string | null
  presets: Record<string, SettingsBundle>
}

const STORAGE_KEY = 'path2plot.settingsPresets'

function readStore(): SettingsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { defaultName: null, presets: {} }
    const parsed = JSON.parse(raw) as Partial<SettingsStore>
    return {
      defaultName: parsed.defaultName ?? null,
      presets: parsed.presets ?? {},
    }
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

/** 古い保存済みプリセットに追加設定がない場合は既定値(OFF)へ補完する */
function normalizePreset(preset: SettingsBundle): SettingsBundle {
  return {
    ...preset,
    gcodeSettings: {
      ...preset.gcodeSettings,
      flipY: preset.gcodeSettings.flipY ?? false,
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
