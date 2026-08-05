import { describe, expect, it } from 'vitest'
import { findSegmentAtPoint } from './segmentHitTest'
import type { PreviewSegment } from './types'

function seg(points: { x: number; y: number }[]): PreviewSegment {
  return { blockId: 0, points, color: '#000', penLiftBefore: true }
}

describe('findSegmentAtPoint', () => {
  const segments: PreviewSegment[] = [
    seg([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]),
    seg([
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ]),
  ]

  it('しきい値内で最も近いセグメントの添字を返す', () => {
    expect(findSegmentAtPoint(segments, { x: 5, y: 0.5 }, 2)).toBe(0)
    expect(findSegmentAtPoint(segments, { x: 5, y: 9.5 }, 2)).toBe(1)
  })

  it('しきい値外はnull', () => {
    expect(findSegmentAtPoint(segments, { x: 5, y: 5 }, 2)).toBeNull()
  })

  it('セグメントが1本もなければnull', () => {
    expect(findSegmentAtPoint([], { x: 0, y: 0 }, 5)).toBeNull()
  })

  it('点扱いのセグメント(1点のみ)は無視する', () => {
    const single = [seg([{ x: 0, y: 0 }])]
    expect(findSegmentAtPoint(single, { x: 0, y: 0 }, 5)).toBeNull()
  })
})
