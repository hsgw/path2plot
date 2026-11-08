import { describe, expect, it } from 'vitest'
import {
  createDefaultSettings,
  parseSettingsFile,
  serializeSettingsFile,
} from './settingsFile'

describe('共有設定JSON', () => {
  it('部分設定はWebと同じ既定値で補完し、BOM付きUTF-8にも対応する', () => {
    const settings = parseSettingsFile(
      '\uFEFF' +
        JSON.stringify({
          schemaVersion: 1,
          settings: { gcodeSettings: { templates: { start: 'G90\nPEN_UP' } } },
        }),
    )
    const defaults = createDefaultSettings()
    defaults.gcodeSettings.templates.start = 'G90\nPEN_UP'
    expect(settings).toEqual(defaults)
  })

  it('全設定をJSONへ書き出して復元できる', () => {
    const settings = createDefaultSettings()
    settings.parseSettings.offsetXMm = -5
    settings.gcodeSettings.flipY = false
    settings.fillSettings.pattern = 'offset'
    settings.pathOptions.joinPaths = true
    settings.pathOptions.reversePaths = true
    expect(parseSettingsFile(serializeSettingsFile(settings))).toEqual(settings)
  })

  it.each([
    [{ schemaVersion: 2, settings: {} }, 'schemaVersion'],
    [{ schemaVersion: 1, settings: [] }, 'settings'],
    [{ schemaVersion: 1, settings: { unrecognized: true } }, 'unrecognized'],
    [
      { schemaVersion: 1, settings: { fillSettings: { pattern: 'invalid' } } },
      'fillSettings.pattern',
    ],
    [
      { schemaVersion: 1, settings: { fillSettings: { spacingMm: 0 } } },
      'fillSettings.spacingMm',
    ],
    [
      { schemaVersion: 1, settings: { gcodeSettings: { drawFeedRate: -1 } } },
      'gcodeSettings.drawFeedRate',
    ],
    [
      {
        schemaVersion: 1,
        settings: { pathOptions: { reversePaths: 'false' } },
      },
      'pathOptions.reversePaths',
    ],
  ])('不正な設定を拒否する (%j)', (file, error) => {
    expect(() => parseSettingsFile(JSON.stringify(file))).toThrow(error)
  })

  it('JSONの指数表記が無限大になる場合は拒否する', () => {
    expect(() =>
      parseSettingsFile(
        '{"schemaVersion":1,"settings":{"joinDistanceMm":1e999}}',
      ),
    ).toThrow('joinDistanceMm')
  })
})
