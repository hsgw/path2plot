import { describe, expect, it } from 'vitest'
import {
  PRUSA_PEN_GCODE_SETTINGS,
  type DrawGroup,
  type GcodeSettings,
} from './types'
import { generateGcode } from './generate'

const groups: DrawGroup[] = [
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
]

describe('generateGcode', () => {
  it('描画・移動座標には描画可能領域の原点オフセット(bedOriginXMm/YMm)を加算する', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedOriginXMm: 44,
      bedOriginYMm: 30,
    }
    const gcode = generateGcode(groups, settings)
    // ローカル(0,0)→(10,0)の移動・描画が、原点オフセット加算後の機械絶対座標で出力される
    expect(gcode).toContain('G00 X44 Y30')
    expect(gcode).toContain('G01 X54 Y30')
  })

  it('パーク位置(FR-30)は原点オフセットの対象外(絶対座標のまま)', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedOriginXMm: 44,
      bedOriginYMm: 30,
      parkX: 85,
      parkY: 175,
    }
    const gcode = generateGcode(groups, settings)
    expect(gcode).toContain('X85 Y175')
  })

  it('原点オフセットが0のときはローカル座標のまま出力される', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedOriginXMm: 0,
      bedOriginYMm: 0,
    }
    const gcode = generateGcode(groups, settings)
    expect(gcode).toContain('G00 X0 Y0')
    expect(gcode).toContain('G01 X10 Y0')
  })

  it('Y反転を有効にすると移動・描画のYをベッド高さ基準で反転して原点を加算する', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedHeightMm: 100,
      bedOriginYMm: 30,
      flipY: true,
    }
    const gcode = generateGcode(groups, settings)
    expect(gcode).toContain('G00 X49 Y130')
    expect(gcode).toContain('G01 X59 Y130')
    expect(gcode).not.toContain('{flipY}')
  })

  it('Y反転が未設定の既存設定では無効として扱う', () => {
    const { flipY: _flipY, ...legacySettings } = PRUSA_PEN_GCODE_SETTINGS
    const gcode = generateGcode(groups, legacySettings as GcodeSettings)
    expect(gcode).toContain('G00 X49 Y35')
    expect(gcode).toContain('G01 X59 Y35')
  })

  it('結合ブロック(FR-14)は1グループ内で1回のペンダウン/アップのみ出力し、連続してG01を出力する', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedOriginXMm: 0,
      bedOriginYMm: 0,
    }
    const joined: DrawGroup[] = [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
      ],
    ]
    const gcode = generateGcode(joined, settings)
    const penDownLine = `G00 Z${settings.penDownZ} F${settings.penFeedRate}`
    const penUpLine = `G00 Z${settings.penUpZ} F${settings.penFeedRate}`
    expect(gcode.split(penDownLine).length - 1).toBe(1)
    expect(gcode.split(penUpLine).length - 1).toBe(1)
    expect(gcode).toContain('G01 X10 Y0')
    expect(gcode).toContain('G01 X10 Y5')
  })

  it('複数グループはそれぞれ独立してペンダウン/アップする', () => {
    const settings = {
      ...PRUSA_PEN_GCODE_SETTINGS,
      bedOriginXMm: 0,
      bedOriginYMm: 0,
    }
    const multi: DrawGroup[] = [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ],
    ]
    const gcode = generateGcode(multi, settings)
    const penDownLine = `G00 Z${settings.penDownZ} F${settings.penFeedRate}`
    expect(gcode.split(penDownLine).length - 1).toBe(2)
  })
})
