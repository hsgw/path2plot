import { describe, expect, it } from 'vitest'
import type { Point } from '../types/geometry'
import { DEFAULT_FILL_SETTINGS, type FillCandidate } from '../types/fill'
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
  it('単純な図形はハッチ線と輪郭線を持つ塗りブロックになる', () => {
    const [block] = buildFillBlocks([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      contourOffsetMm: 0,
    })
    expect(block.error).toBeUndefined()
    expect(block.color).toBe('#123456')
    expect(block.hatchChains.length).toBeGreaterThan(0)
    expect(block.outlineLoops).not.toBeNull()
    expect(block.outlineLoops![0][0]).toEqual(block.outlineLoops![0].at(-1))
  })

  it('drawOutline=falseの場合はoutlineLoopsがnullになる', () => {
    const [block] = buildFillBlocks([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      drawOutline: false,
    })
    expect(block.outlineLoops).toBeNull()
    expect(block.hatchChains.length).toBeGreaterThan(0)
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
    expect(block.hatchChains).toEqual([])
    expect(block.outlineLoops).toBeNull()
  })

  it('zigzag設定によりhatchChainsの本数(連結度合い)が変わる', () => {
    const settingsBase = {
      ...DEFAULT_FILL_SETTINGS,
      contourOffsetMm: 0,
      angleDeg: 0,
      spacingMm: 1,
    }
    const [withoutZigzag] = buildFillBlocks([candidate([SQUARE_10])], {
      ...settingsBase,
      zigzag: false,
    })
    const [withZigzag] = buildFillBlocks([candidate([SQUARE_10])], {
      ...settingsBase,
      zigzag: true,
    })
    expect(withoutZigzag.hatchChains.length).toBe(10)
    expect(withZigzag.hatchChains.length).toBe(1)
  })
})
