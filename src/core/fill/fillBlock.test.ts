import { describe, expect, it } from 'vitest'
import type { Point } from '../geometry/types'
import {
  DEFAULT_FILL_SETTINGS,
  type FillCandidate,
  type FillSettings,
} from './types'
import { buildFillBlocks } from './fillBlock'

function candidate(
  contours: Point[][],
  overrides: Partial<FillCandidate> = {},
): FillCandidate {
  return {
    id: 'fill-0',
    fillColor: '#123456',
    fillRule: 'nonzero',
    contours,
    ...overrides,
  }
}

const SQUARE_10: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

describe('buildFillBlocks(FR-16〜21: 塗りブロック生成のオーケストレーション)', () => {
  it('既定では輪郭線を描かず、ハッチ線だけの塗りブロックになる', () => {
    const [block] = buildFillBlocks([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      contourOffsetMm: 0,
    })
    expect(block.error).toBeUndefined()
    expect(block.color).toBe('#123456')
    expect(block.fillChains.length).toBeGreaterThan(0)
    expect(block.outlineLoops).toBeNull()
  })

  it('drawOutline=trueの場合は閉じた輪郭ループが加わる', () => {
    const [block] = buildFillBlocks([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      contourOffsetMm: 0,
      drawOutline: true,
    })
    expect(block.outlineLoops).not.toBeNull()
    expect(block.outlineLoops![0][0]).toEqual(block.outlineLoops![0].at(-1))
    expect(block.fillChains.length).toBeGreaterThan(0)
  })

  it('輪郭オフセットで形状が崩壊する場合はエラーになりハッチ・輪郭とも空になる', () => {
    const thin: Point[] = [
      { x: 5, y: 4.5 },
      { x: 55, y: 4.5 },
      { x: 55, y: 5.5 },
      { x: 5, y: 5.5 },
    ]
    const [block] = buildFillBlocks([candidate([thin])], {
      ...DEFAULT_FILL_SETTINGS,
      contourOffsetMm: 0.6,
    })
    expect(block.error).toEqual({
      fillBlockId: 'fill-0',
      sourceId: undefined,
      kind: 'collapsed',
      message: expect.any(String),
    })
    expect(block.fillChains).toEqual([])
    expect(block.outlineLoops).toBeNull()
  })

  it('enabled=falseの場合は塗りブロックを一切生成しない', () => {
    const blocks = buildFillBlocks([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      enabled: false,
    })
    expect(blocks).toEqual([])
  })

  it('connect設定によりfillChainsの本数(連結度合い)が変わる', () => {
    const settingsBase = {
      ...DEFAULT_FILL_SETTINGS,
      contourOffsetMm: 0,
      angleDeg: 0,
      spacingMm: 1,
    }
    const chainsFor = (connect: FillSettings['connect']): number =>
      buildFillBlocks([candidate([SQUARE_10])], {
        ...settingsBase,
        connect,
      })[0].fillChains.length

    expect(chainsFor('none')).toBe(10)
    expect(chainsFor('boustrophedon')).toBe(1)
    // ジグザグは各行の端点を1つずつ拾って1本に繋ぐ
    expect(chainsFor('zigzag')).toBe(1)
  })

  it('ジグザグは各行から1点ずつ拾った折れ線になる', () => {
    const [block] = buildFillBlocks([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      contourOffsetMm: 0,
      angleDeg: 0,
      spacingMm: 1,
      connect: 'zigzag',
    })
    expect(block.fillChains.length).toBe(1)
    expect(block.fillChains[0].length).toBe(10)
  })

  it('クロスハッチは2方向分のチェーンを持つ', () => {
    const settingsBase = {
      ...DEFAULT_FILL_SETTINGS,
      contourOffsetMm: 0,
      angleDeg: 0,
      crossAngleDeg: 90,
      spacingMm: 1,
      connect: 'none' as const,
    }
    const [single] = buildFillBlocks([candidate([SQUARE_10])], settingsBase)
    const [cross] = buildFillBlocks([candidate([SQUARE_10])], {
      ...settingsBase,
      crossHatch: true,
    })
    expect(single.fillChains.length).toBe(10)
    expect(cross.fillChains.length).toBe(20)
  })

  it('同心オフセットはリング群を生成し、輪郭線は二重描画を避けて生成しない', () => {
    const [block] = buildFillBlocks([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      pattern: 'concentric',
      contourOffsetMm: 0,
      spacingMm: 1,
      drawOutline: true,
    })
    expect(block.outlineLoops).toBeNull()
    // 10x10の正方形を1mmずつ内側へ掘ると5リング(最後は幅0で消える)
    expect(block.fillChains.length).toBe(5)
    for (const ring of block.fillChains) {
      expect(ring[0]).toEqual(ring.at(-1))
    }
  })

  it('スパイラルは同心リングを1本につないだチェーンになる', () => {
    const [block] = buildFillBlocks([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      pattern: 'spiral',
      contourOffsetMm: 0,
      spacingMm: 1,
    })
    expect(block.outlineLoops).toBeNull()
    expect(block.fillChains.length).toBe(1)
  })
})
