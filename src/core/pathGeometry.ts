import type { Matrix2D, Point } from '../types/geometry'
import { flattenCubicBezier } from './bezierFlatten'
import { apply } from './matrix'
import type { PathCommand } from './pathCommand'

/** PathCommandの制御点すべてに行列を適用する(ベジェは制御点ごと変換しても曲線として不変というアフィン変換の性質を利用) */
export function transformPathCommands(
  commands: PathCommand[],
  m: Matrix2D,
): PathCommand[] {
  return commands.map((cmd) => {
    switch (cmd.type) {
      case 'M':
        return { type: 'M', point: apply(m, cmd.point) }
      case 'L':
        return { type: 'L', point: apply(m, cmd.point) }
      case 'C':
        return {
          type: 'C',
          c1: apply(m, cmd.c1),
          c2: apply(m, cmd.c2),
          point: apply(m, cmd.point),
        }
      case 'Z':
        return cmd
    }
  })
}

/**
 * 変換済み(最終的な描画空間の単位)PathCommand列を、M区切りのサブパスごとの点列へ分解する。
 * toleranceは点列と同じ空間の単位(mm)で指定する。
 */
export function pathCommandsToPolylines(
  commands: PathCommand[],
  tolerance: number,
): Point[][] {
  const result: Point[][] = []
  let current: Point[] = []
  let subpathStart: Point | null = null
  let lastPoint: Point | null = null

  const finishSubpath = (): void => {
    if (current.length >= 2) result.push(current)
    current = []
  }

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        finishSubpath()
        current = [cmd.point]
        subpathStart = cmd.point
        lastPoint = cmd.point
        break
      case 'L':
        current.push(cmd.point)
        lastPoint = cmd.point
        break
      case 'C': {
        if (!lastPoint) break
        current.push(
          ...flattenCubicBezier(
            lastPoint,
            cmd.c1,
            cmd.c2,
            cmd.point,
            tolerance,
          ),
        )
        lastPoint = cmd.point
        break
      }
      case 'Z': {
        if (
          subpathStart &&
          lastPoint &&
          (lastPoint.x !== subpathStart.x || lastPoint.y !== subpathStart.y)
        ) {
          current.push(subpathStart)
        }
        lastPoint = subpathStart
        finishSubpath()
        break
      }
    }
  }
  finishSubpath()
  return result
}
