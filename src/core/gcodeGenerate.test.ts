import { describe, expect, it } from 'vitest'
import { DEFAULT_GCODE_SETTINGS } from '../types/gcode'
import { generateGcode, type DrawGroup } from './gcodeGenerate'

const groups: DrawGroup[] = [
  {
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  },
]

describe('generateGcode', () => {
  it('描画・移動座標には描画可能領域の原点オフセット(bedOriginXMm/YMm)を加算する', () => {
    const settings = {
      ...DEFAULT_GCODE_SETTINGS,
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
      ...DEFAULT_GCODE_SETTINGS,
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
      ...DEFAULT_GCODE_SETTINGS,
      bedOriginXMm: 0,
      bedOriginYMm: 0,
    }
    const gcode = generateGcode(groups, settings)
    expect(gcode).toContain('G00 X0 Y0')
    expect(gcode).toContain('G01 X10 Y0')
  })

  it('結合ブロック(FR-14)は1グループ内で1回のペンダウン/アップのみ出力し、連続してG01を出力する', () => {
    const settings = {
      ...DEFAULT_GCODE_SETTINGS,
      bedOriginXMm: 0,
      bedOriginYMm: 0,
    }
    const joined: DrawGroup[] = [
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 5 },
        ],
      },
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
      ...DEFAULT_GCODE_SETTINGS,
      bedOriginXMm: 0,
      bedOriginYMm: 0,
    }
    const multi: DrawGroup[] = [
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      },
      {
        points: [
          { x: 20, y: 0 },
          { x: 30, y: 0 },
        ],
      },
    ]
    const gcode = generateGcode(multi, settings)
    const penDownLine = `G00 Z${settings.penDownZ} F${settings.penFeedRate}`
    expect(gcode.split(penDownLine).length - 1).toBe(2)
  })
})
