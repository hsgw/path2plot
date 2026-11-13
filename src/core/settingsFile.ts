import { DEFAULT_FILL_SETTINGS, type FillSettings } from './fill/types'
import {
  LEGACY_DEFAULT_GCODE_SETTINGS,
  type GcodeSettings,
} from './gcode/types'
import { DEFAULT_JOIN_DISTANCE_MM } from './plan/strokeJoin'
import { DEFAULT_PARSE_SETTINGS, type ParseSettings } from './svg/types'
import defaultSettingsFile from './default-settings.json'

export const DEFAULT_PATH_OPTIONS = {
  optimizePaths: true,
  optimizeTravel: true,
  reorderPaths: false,
  reversePaths: false,
  joinPaths: false,
}

export type PathOptions = typeof DEFAULT_PATH_OPTIONS

export interface SettingsBundle {
  parseSettings: ParseSettings
  gcodeSettings: GcodeSettings
  fillSettings: FillSettings
  joinDistanceMm: number
  penWidthMm: number
  minStrokeLengthMm: number
  pathOptions: PathOptions
}

function buildLegacySettings(gcodeSettings: GcodeSettings): SettingsBundle {
  return {
    parseSettings: { ...DEFAULT_PARSE_SETTINGS },
    gcodeSettings: {
      ...gcodeSettings,
      templates: { ...gcodeSettings.templates },
    },
    fillSettings: { ...DEFAULT_FILL_SETTINGS },
    joinDistanceMm: DEFAULT_JOIN_DISTANCE_MM,
    penWidthMm: 0,
    minStrokeLengthMm: 0,
    pathOptions: { ...DEFAULT_PATH_OPTIONS },
  }
}

const DEFAULT_SETTINGS: SettingsBundle = {
  ...defaultSettingsFile.settings,
  fillSettings: defaultSettingsFile.settings.fillSettings as FillSettings,
}

export function createDefaultSettings() {
  const settings = DEFAULT_SETTINGS
  return {
    ...settings,
    parseSettings: { ...settings.parseSettings },
    gcodeSettings: {
      ...settings.gcodeSettings,
      templates: { ...settings.gcodeSettings.templates },
    },
    fillSettings: { ...settings.fillSettings },
    pathOptions: { ...settings.pathOptions },
  }
}

/** 更新前の補完値を維持するプリセット生成。保存済み旧設定の読込専用。 */
export function createLegacySettings(
  gcodeSettings: GcodeSettings = LEGACY_DEFAULT_GCODE_SETTINGS,
) {
  return buildLegacySettings(gcodeSettings)
}

/** 移行時にだけ使う、更新前の初期プリセット一式。 */
export const LEGACY_DEFAULT_SETTINGS = createLegacySettings()

export const MIN_FILL_SPACING_MM = 0.01

export const GCODE_MINIMUMS: Partial<
  Record<Exclude<keyof GcodeSettings, 'templates' | 'flipY'>, number>
> = {
  bedWidthMm: 0.001,
  bedHeightMm: 0.001,
  drawFeedRate: 0.001,
  travelFeedRate: 0.001,
  penFeedRate: 0.001,
  drawAccel: 0,
  travelAccel: 0,
  xyJerk: 0,
  minSegmentLengthMm: 0,
}

const minimums = new Map<string, number>([
  ['joinDistanceMm', 0],
  ['penWidthMm', 0],
  ['minStrokeLengthMm', 0],
  ['parseSettings.dpi', 1],
  ['parseSettings.scaleFactor', 0.001],
  ['parseSettings.bezierToleranceMm', 0.001],
  ['fillSettings.spacingMm', MIN_FILL_SPACING_MM],
  ['fillSettings.waveLengthMm', 0.01],
  ['fillSettings.waveAmplitudeMm', 0],
  ['fillSettings.waveSegmentsPerCycle', 2],
  ['fillSettings.minHatchLineLengthMm', 0],
  ['fillSettings.connectDistanceFactor', 0.1],
  ...Object.entries(GCODE_MINIMUMS).flatMap(([key, min]): [string, number][] =>
    min === undefined ? [] : [[`gcodeSettings.${key}`, min]],
  ),
])

const choices = new Map([
  ['fillSettings.pattern', ['none', 'hatch', 'offset']],
  ['fillSettings.waveform', ['straight', 'sine', 'triangle']],
  ['fillSettings.connect', ['none', 'zigzag', 'boustrophedon']],
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function resolveValue(
  value: unknown,
  defaultValue: unknown,
  path: string,
): unknown {
  if (isRecord(defaultValue)) {
    if (!isRecord(value))
      throw new Error(`${path || 'settings'} はオブジェクトで指定してください`)
    const resolved = { ...defaultValue }
    for (const [key, entry] of Object.entries(value)) {
      const field = path ? `${path}.${key}` : key
      if (!Object.hasOwn(defaultValue, key))
        throw new Error(`不明な設定項目です ${field}`)
      resolved[key] = resolveValue(entry, defaultValue[key], field)
    }
    return resolved
  }
  if (typeof value !== typeof defaultValue) {
    throw new Error(`${path} の型は ${typeof defaultValue} です`)
  }
  if (typeof value === 'number') {
    const min = minimums.get(path)
    if (!Number.isFinite(value) || (min !== undefined && value < min)) {
      throw new Error(`${path} の数値が範囲外です`)
    }
  }
  const allowed = choices.get(path)
  if (allowed && !allowed.includes(value as string)) {
    throw new Error(`${path} は ${allowed.join(' / ')} から選んでください`)
  }
  return value
}

const SCHEMA_VERSION = 1

/** Web UIとCLIで同じ既定値を補完し、適用前に設定ファイル全体を検証する。 */
export function parseSettingsFile(text: string): SettingsBundle {
  let file: unknown
  try {
    file = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('設定ファイルが正しいJSON形式ではありません')
  }
  if (!isRecord(file) || file.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `未対応の設定ファイルです。schemaVersion は ${SCHEMA_VERSION} を指定してください`,
    )
  }
  for (const key of Object.keys(file)) {
    if (key !== 'schemaVersion' && key !== 'settings')
      throw new Error(`不明な設定項目です ${key}`)
  }
  return resolveValue(
    file.settings,
    createDefaultSettings(),
    '',
  ) as SettingsBundle
}

export function serializeSettingsFile(settings: SettingsBundle): string {
  const file = { schemaVersion: SCHEMA_VERSION, settings }
  const text = JSON.stringify(file, null, 2)
  parseSettingsFile(text)
  return text + '\n'
}
