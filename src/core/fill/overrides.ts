import type { FillSettings } from './types'

/** グローバル設定に個別上書き(未設定フィールドはグローバルへ追従)をマージした実効設定を返す */
export function resolveEffectiveFillSettings(
  global: FillSettings,
  override: Partial<FillSettings> | undefined,
): FillSettings {
  return override ? { ...global, ...override } : global
}
