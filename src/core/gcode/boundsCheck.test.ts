import { describe, expect, it } from 'vitest'
import type { ParsedStroke } from '../svg/types'
import { checkStrokeBounds, isPointOutOfBounds } from './boundsCheck'

const bed = { widthMm: 170, heightMm: 170 }

describe('isPointOutOfBounds', () => {
  it('境界上の点(0,0)〜(width,height)はマージン0のとき範囲内', () => {
    expect(isPointOutOfBounds({ x: 0, y: 0 }, bed)).toBe(false)
    expect(isPointOutOfBounds({ x: 170, y: 170 }, bed)).toBe(false)
  })

  it('負の座標・領域を超える座標は範囲外', () => {
    expect(isPointOutOfBounds({ x: -0.01, y: 10 }, bed)).toBe(true)
    expect(isPointOutOfBounds({ x: 10, y: 170.01 }, bed)).toBe(true)
  })

  it('マージンを指定すると境界上の点も範囲外になる(円弧・ベジェの近似誤差対策)', () => {
    expect(isPointOutOfBounds({ x: 170, y: 100 }, bed, 0.1)).toBe(true)
    expect(isPointOutOfBounds({ x: 0.05, y: 100 }, bed, 0.1)).toBe(true)
    expect(isPointOutOfBounds({ x: 1, y: 100 }, bed, 0.1)).toBe(false)
  })
})

describe('checkStrokeBounds', () => {
  it('全ストロークが範囲内なら警告なし', () => {
    const strokes: ParsedStroke[] = [
      {
        id: 's1',
        color: '#000',
        points: [
          { x: 0, y: 0 },
          { x: 170, y: 170 },
        ],
      },
    ]
    expect(checkStrokeBounds(strokes, bed)).toEqual([])
  })

  it('範囲外の点を含むストロークを検出し、はみ出した点を報告する', () => {
    const strokes: ParsedStroke[] = [
      {
        id: 's1',
        sourceId: 'rect1',
        color: '#000',
        points: [
          { x: 0, y: 0 },
          { x: 250, y: 250 },
        ],
      },
      {
        id: 's2',
        color: '#000',
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
      },
    ]
    const warnings = checkStrokeBounds(strokes, bed)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].strokeId).toBe('s1')
    expect(warnings[0].sourceId).toBe('rect1')
    expect(warnings[0].points).toEqual([{ x: 250, y: 250 }])
  })
})
