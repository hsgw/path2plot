import { describe, expect, it } from 'vitest'
import type { Point } from '../geometry/types'
import { generateSpiralPath } from './spiral'

const SQUARE_20: Point[] = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 20 },
  { x: 0, y: 20 },
]

describe('generateSpiralPath(FR-17: スパイラル)', () => {
  it('単純な形状は1本のチェーンにまとまる', () => {
    const chains = generateSpiralPath([SQUARE_20], 2)
    expect(chains.length).toBe(1)
    expect(chains[0].length).toBeGreaterThan(10)
  })

  it('外側のリングから内側へ向かって進む', () => {
    const [chain] = generateSpiralPath([SQUARE_20], 2)
    const distanceToCenter = (p: Point): number =>
      Math.max(Math.abs(p.x - 10), Math.abs(p.y - 10))
    // 始点は外周付近、終点は中心付近
    expect(distanceToCenter(chain[0])).toBeGreaterThan(8)
    expect(distanceToCenter(chain.at(-1)!)).toBeLessThan(5)
  })

  it('チェーンの全ての点が塗り領域の内側にある', () => {
    const chains = generateSpiralPath([SQUARE_20], 2)
    for (const chain of chains) {
      for (const p of chain) {
        expect(p.x).toBeGreaterThanOrEqual(-0.01)
        expect(p.x).toBeLessThanOrEqual(20.01)
        expect(p.y).toBeGreaterThanOrEqual(-0.01)
        expect(p.y).toBeLessThanOrEqual(20.01)
      }
    }
  })

  it('離れた2つの島は別々のチェーンになる(島をまたぐ接続線を引かない)', () => {
    const left: Point[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ]
    const right: Point[] = [
      { x: 40, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 20 },
      { x: 40, y: 20 },
    ]
    const paths = [left, right]
    const chains = generateSpiralPath(paths, 2)
    expect(chains.length).toBeGreaterThanOrEqual(2)
    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) {
        const mid = {
          x: (chain[i - 1].x + chain[i].x) / 2,
          y: (chain[i - 1].y + chain[i].y) / 2,
        }
        // 島の隙間(20 < x < 40)を通る線分がない
        expect(mid.x > 20.01 && mid.x < 39.99).toBe(false)
      }
    }
  })

  it('ドーナツでも穴の内部を通る線分を引かない', () => {
    const outer: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ]
    const hole: Point[] = [
      { x: 15, y: 15 },
      { x: 15, y: 25 },
      { x: 25, y: 25 },
      { x: 25, y: 15 },
    ]
    // リング自体は境界線上に乗るため、境界上の点を弾かないよう「穴の内部を厳密に通るか」で判定する
    for (const chain of generateSpiralPath([outer, hole], 2)) {
      for (let i = 1; i < chain.length; i++) {
        const mid = {
          x: (chain[i - 1].x + chain[i].x) / 2,
          y: (chain[i - 1].y + chain[i].y) / 2,
        }
        const insideHole =
          mid.x > 15.01 && mid.x < 24.99 && mid.y > 15.01 && mid.y < 24.99
        expect(insideHole).toBe(false)
      }
    }
  })

  it('線間隔が0以下・輪郭が空なら何も生成しない', () => {
    expect(generateSpiralPath([SQUARE_20], 0)).toEqual([])
    expect(generateSpiralPath([], 2)).toEqual([])
  })

  it('skipOutlineRing=trueなら最も外側のリング(level 0)を除いた1つ内側から始まる', () => {
    const distanceToCenter = (p: Point): number =>
      Math.max(Math.abs(p.x - 10), Math.abs(p.y - 10))
    const [chain] = generateSpiralPath([SQUARE_20], 2, true)
    // level 0(外周、中心からの距離10)は除外され、level 1(距離8)から始まる
    expect(distanceToCenter(chain[0])).toBeCloseTo(8, 1)
  })
})
