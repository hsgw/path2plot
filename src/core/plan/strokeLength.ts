import { distance } from '../geometry/vector'
import type { ParsedStroke } from '../svg/types'
import type { JoinedBlock } from './types'
import { materializeBlock } from './strokeJoin'

/**
 * 通常ストロークの結合ブロックを、ブロック全体の経路長でフィルタする。
 * materializeBlockの連結点列を測るため、ストローク間の接続距離も長さに含む。
 */
export function filterJoinedBlocksByMinimumLength(
  blocks: JoinedBlock[],
  strokes: ParsedStroke[],
  minLengthMm: number,
): JoinedBlock[] {
  if (minLengthMm <= 0) return blocks
  return blocks.filter((block) => {
    const points = materializeBlock(block, strokes, false).points
    let length = 0
    for (let i = 1; i < points.length; i++) {
      length += distance(points[i - 1], points[i])
    }
    return length >= minLengthMm
  })
}
