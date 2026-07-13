import { describe, expect, it } from 'vitest'
import type { ParsedStroke } from '../types/svg'
import { DEFAULT_GCODE_SETTINGS } from '../types/gcode'
import { generateGcode } from './gcodeGenerate'

const strokes: ParsedStroke[] = [
  {
    id: 's1',
    color: '#000',
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
    const gcode = generateGcode(strokes, settings)
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
    const gcode = generateGcode(strokes, settings)
    expect(gcode).toContain('X85 Y175')
  })

  it('原点オフセットが0のときはローカル座標のまま出力される', () => {
    const settings = {
      ...DEFAULT_GCODE_SETTINGS,
      bedOriginXMm: 0,
      bedOriginYMm: 0,
    }
    const gcode = generateGcode(strokes, settings)
    expect(gcode).toContain('G00 X0 Y0')
    expect(gcode).toContain('G01 X10 Y0')
  })
})
