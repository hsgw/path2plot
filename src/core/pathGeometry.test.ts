import { describe, expect, it } from 'vitest'
import type { PathCommand } from './pathCommand'
import { pathCommandsToPolylines } from './pathGeometry'

describe('pathCommandsToPolylines(FR-11: サブパス(M区切り)分解)', () => {
  it('M区切りごとに独立したストロークへ分解する', () => {
    const commands: PathCommand[] = [
      { type: 'M', point: { x: 10, y: 25 } },
      { type: 'L', point: { x: 40, y: 25 } },
      { type: 'M', point: { x: 50, y: 25 } },
      { type: 'L', point: { x: 80, y: 25 } },
      { type: 'M', point: { x: 90, y: 25 } },
      { type: 'L', point: { x: 120, y: 25 } },
    ]
    const polylines = pathCommandsToPolylines(commands, 0.1)
    expect(polylines).toEqual([
      [
        { x: 10, y: 25 },
        { x: 40, y: 25 },
      ],
      [
        { x: 50, y: 25 },
        { x: 80, y: 25 },
      ],
      [
        { x: 90, y: 25 },
        { x: 120, y: 25 },
      ],
    ])
  })

  it('各サブパスの開始点(◯表示対象)はMコマンドの座標そのものになる(FR-24)', () => {
    const commands: PathCommand[] = [
      { type: 'M', point: { x: 5, y: 5 } },
      { type: 'L', point: { x: 15, y: 5 } },
      { type: 'M', point: { x: 100, y: 100 } },
      { type: 'L', point: { x: 100, y: 200 } },
    ]
    const polylines = pathCommandsToPolylines(commands, 0.1)
    expect(polylines[0][0]).toEqual({ x: 5, y: 5 })
    expect(polylines[1][0]).toEqual({ x: 100, y: 100 })
  })

  it('先頭2点から描画方向(FR-24)が算出できる', () => {
    const commands: PathCommand[] = [
      { type: 'M', point: { x: 0, y: 0 } },
      { type: 'L', point: { x: 0, y: 10 } },
    ]
    const [polyline] = pathCommandsToPolylines(commands, 0.1)
    const direction = {
      x: polyline[1].x - polyline[0].x,
      y: polyline[1].y - polyline[0].y,
    }
    expect(direction).toEqual({ x: 0, y: 10 })
  })

  it('Zで始点へ戻る閉パスは始点座標を末尾に追加してからサブパスを終える', () => {
    const commands: PathCommand[] = [
      { type: 'M', point: { x: 0, y: 0 } },
      { type: 'L', point: { x: 10, y: 0 } },
      { type: 'L', point: { x: 10, y: 10 } },
      { type: 'Z' },
    ]
    const [polyline] = pathCommandsToPolylines(commands, 0.1)
    expect(polyline).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 0 },
    ])
  })

  it('点1つだけの退化したサブパス(M直後にMまたは終端)は結果から除外する', () => {
    const commands: PathCommand[] = [
      { type: 'M', point: { x: 0, y: 0 } },
      { type: 'M', point: { x: 10, y: 10 } },
      { type: 'L', point: { x: 20, y: 20 } },
    ]
    const polylines = pathCommandsToPolylines(commands, 0.1)
    expect(polylines).toEqual([
      [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ],
    ])
  })
})
