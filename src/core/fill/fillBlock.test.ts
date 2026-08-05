import { describe, expect, it } from 'vitest'
import type { Point } from '../geometry/types'
import {
  DEFAULT_FILL_SETTINGS,
  type FillCandidate,
  type FillSettings,
} from './types'
import { buildFillBlocks } from './fillBlock'

const NO_OVERRIDES: Map<string, Partial<FillSettings>> = new Map()
/** テストでは個別上書きを使わないため、overrides引数を省略できるようにする薄いラッパー */
function build(
  candidates: FillCandidate[],
  settings: FillSettings,
): ReturnType<typeof buildFillBlocks> {
  return buildFillBlocks(candidates, settings, NO_OVERRIDES)
}

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
    const [block] = build([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 0,
    })
    expect(block.error).toBeUndefined()
    expect(block.color).toBe('#123456')
    expect(block.fillChains.length).toBeGreaterThan(0)
    expect(block.outlineLoops).toBeNull()
  })

  it('drawOutline=trueの場合は閉じた輪郭ループが加わる', () => {
    const [block] = build([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 0,
      drawOutline: true,
    })
    expect(block.outlineLoops).not.toBeNull()
    expect(block.outlineLoops![0][0]).toEqual(block.outlineLoops![0].at(-1))
    expect(block.fillChains.length).toBeGreaterThan(0)
  })

  it('塗りオフセットを設定していても、輪郭線はオフセット前の元の輪郭で描かれる', () => {
    const [block] = build([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 1,
      drawOutline: true,
    })
    expect(block.outlineLoops).not.toBeNull()
    const loop = block.outlineLoops![0]
    const xs = loop.map((p) => p.x)
    const ys = loop.map((p) => p.y)
    expect(Math.min(...xs)).toBeCloseTo(0)
    expect(Math.max(...xs)).toBeCloseTo(10)
    expect(Math.min(...ys)).toBeCloseTo(0)
    expect(Math.max(...ys)).toBeCloseTo(10)
  })

  it('塗りオフセットで形状が崩壊する場合はエラーになりハッチは空になるが、輪郭線はオフセット前の元輪郭で描かれる', () => {
    const thin: Point[] = [
      { x: 5, y: 4.5 },
      { x: 55, y: 4.5 },
      { x: 55, y: 5.5 },
      { x: 5, y: 5.5 },
    ]
    const [block] = build([candidate([thin])], {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 0.6,
      drawOutline: true,
    })
    expect(block.error).toEqual({
      fillBlockId: 'fill-0',
      sourceId: undefined,
      kind: 'collapsed',
      message: expect.any(String),
    })
    expect(block.fillChains).toEqual([])
    expect(block.outlineLoops).not.toBeNull()
    const loop = block.outlineLoops![0]
    expect(loop[0]).toEqual(loop.at(-1))
    expect(loop).toHaveLength(thin.length + 1)
    for (const p of thin) {
      expect(loop).toContainEqual(expect.objectContaining({ x: p.x, y: p.y }))
    }
  })

  it('塗りオフセットで形状が崩壊してもdrawOutline=falseなら輪郭線は生成されない', () => {
    const thin: Point[] = [
      { x: 5, y: 4.5 },
      { x: 55, y: 4.5 },
      { x: 55, y: 5.5 },
      { x: 5, y: 5.5 },
    ]
    const [block] = build([candidate([thin])], {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 0.6,
    })
    expect(block.error).toBeDefined()
    expect(block.outlineLoops).toBeNull()
  })

  it('塗りオフセットで括れが分裂しても両方の島に塗りが生成される', () => {
    const dumbbell: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4.5 },
      { x: 30, y: 4.5 },
      { x: 30, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 5.5 },
      { x: 10, y: 5.5 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const [block] = build([candidate([dumbbell])], {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 0.6,
      angleDeg: 0,
      spacingMm: 1,
    })
    expect(block.error).toBeUndefined()
    expect(block.fillChains.length).toBeGreaterThan(0)
    const xs = block.fillChains.flat().map((p) => p.x)
    // 左の島(x<10付近)と右の島(x>30付近)の両方に線が引かれている
    expect(Math.min(...xs)).toBeLessThan(10)
    expect(Math.max(...xs)).toBeGreaterThan(30)
  })

  it('enabled=falseの場合は塗りブロックを一切生成しない', () => {
    const blocks = build([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      enabled: false,
    })
    expect(blocks).toEqual([])
  })

  it('connect設定によりfillChainsの本数(連結度合い)が変わる', () => {
    const settingsBase = {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 0,
      angleDeg: 0,
      spacingMm: 1,
    }
    const chainsFor = (connect: FillSettings['connect']): number =>
      build([candidate([SQUARE_10])], {
        ...settingsBase,
        connect,
      })[0].fillChains.length

    expect(chainsFor('none')).toBe(10)
    expect(chainsFor('boustrophedon')).toBe(1)
    // ジグザグは各行の端点を1つずつ拾って1本に繋ぐ
    expect(chainsFor('zigzag')).toBe(1)
  })

  it('ジグザグは各行から1点ずつ拾った折れ線になる', () => {
    const [block] = build([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 0,
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
      fillOffsetMm: 0,
      angleDeg: 0,
      crossAngleDeg: 90,
      spacingMm: 1,
      connect: 'none' as const,
    }
    const [single] = build([candidate([SQUARE_10])], settingsBase)
    const [cross] = build([candidate([SQUARE_10])], {
      ...settingsBase,
      crossHatch: true,
    })
    expect(single.fillChains.length).toBe(10)
    expect(cross.fillChains.length).toBe(20)
  })

  it('同心オフセットはリング群を生成し、輪郭線は二重描画を避けて生成しない', () => {
    const [block] = build([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      pattern: 'concentric',
      fillOffsetMm: 0,
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
    const [block] = build([candidate([SQUARE_10])], {
      ...DEFAULT_FILL_SETTINGS,
      pattern: 'spiral',
      fillOffsetMm: 0,
      spacingMm: 1,
    })
    expect(block.outlineLoops).toBeNull()
    expect(block.fillChains.length).toBe(1)
  })

  it('個別上書きは対象のfillだけに適用され、他はグローバル設定に従う', () => {
    const settings = {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 0,
      drawOutline: false,
    }
    const overrides = new Map<string, Partial<FillSettings>>([
      ['fill-0', { drawOutline: true }],
    ])
    const [overridden, plain] = buildFillBlocks(
      [
        candidate([SQUARE_10], { id: 'fill-0' }),
        candidate([SQUARE_10], { id: 'fill-1' }),
      ],
      settings,
      overrides,
    )
    expect(overridden.outlineLoops).not.toBeNull()
    expect(plain.outlineLoops).toBeNull()
  })

  it('ハッチ線の最小長さ未満の線を除外する(connect=none)', () => {
    const settingsBase = {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 0,
      angleDeg: 0,
      spacingMm: 1,
      connect: 'none' as const,
    }
    // SQUARE_10のハッチ線は全て長さ10。11を指定すると全て除外される
    const [none] = build([candidate([SQUARE_10])], settingsBase)
    const [filtered] = build([candidate([SQUARE_10])], {
      ...settingsBase,
      minHatchLineLengthMm: 11,
    })
    expect(none.fillChains.length).toBe(10)
    expect(filtered.fillChains.length).toBe(0)
  })

  it('ハッチ線の最小長さ未満の線を除外する(connect=boustrophedon)', () => {
    const settingsBase = {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 0,
      angleDeg: 0,
      spacingMm: 1,
      connect: 'boustrophedon' as const,
    }
    const [filtered] = build([candidate([SQUARE_10])], {
      ...settingsBase,
      minHatchLineLengthMm: 11,
    })
    expect(filtered.fillChains).toEqual([])
  })

  it('ジグザグは接続前の個々のハッチ線ではなく、接続後の結果に対して最小長さを判定する', () => {
    const settingsBase = {
      ...DEFAULT_FILL_SETTINGS,
      fillOffsetMm: 0,
      angleDeg: 0,
      spacingMm: 1,
      connect: 'zigzag' as const,
    }
    // 個々のハッチ線(長さ10)は11未満で全て除外対象だが、zigzagの接続結果(1本の折れ線)は
    // 始点-終点の直線距離が10より大きいため、11では除外されない
    const [notFiltered] = build([candidate([SQUARE_10])], {
      ...settingsBase,
      minHatchLineLengthMm: 11,
    })
    expect(notFiltered.fillChains.length).toBe(1)
    // 接続結果そのものより長い閾値を指定すれば除外される
    const [filtered] = build([candidate([SQUARE_10])], {
      ...settingsBase,
      minHatchLineLengthMm: 1000,
    })
    expect(filtered.fillChains).toEqual([])
  })

  it('グローバルenabled=falseでも、個別上書きでenabled=trueにしたfillは生成される', () => {
    const overrides = new Map<string, Partial<FillSettings>>([
      ['fill-0', { enabled: true }],
    ])
    const blocks = buildFillBlocks(
      [
        candidate([SQUARE_10], { id: 'fill-0' }),
        candidate([SQUARE_10], { id: 'fill-1' }),
      ],
      { ...DEFAULT_FILL_SETTINGS, enabled: false },
      overrides,
    )
    expect(blocks.map((b) => b.id)).toEqual(['fill-0'])
  })
})
