import { describe, expect, it } from 'vitest'
import type { Point } from '../geometry/types'
import { filterMinSegmentLength } from './segmentFilter'

describe('filterMinSegmentLength', () => {
  it('最小長未満の中間点を間引く', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 0.05, y: 0 },
      { x: 0.08, y: 0 },
      { x: 5, y: 0 },
    ]
    const result = filterMinSegmentLength(points, 0.1)
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ])
  })

  it('最小長以上離れた点はすべて保持する', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]
    expect(filterMinSegmentLength(points, 0.1)).toEqual(points)
  })

  it('始点・終点は間隔に関わらず常に保持する', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 0.01, y: 0 },
      { x: 0.02, y: 0 },
    ]
    const result = filterMinSegmentLength(points, 1)
    expect(result[0]).toEqual(points[0])
    expect(result[result.length - 1]).toEqual(points[points.length - 1])
  })

  it('minLengthMmが0以下のときは間引かない', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 0.001, y: 0 },
      { x: 0.002, y: 0 },
    ]
    expect(filterMinSegmentLength(points, 0)).toEqual(points)
  })

  it('点が2つ以下のときはそのまま返す', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 0.001, y: 0 },
    ]
    expect(filterMinSegmentLength(points, 1)).toEqual(points)
  })
})
