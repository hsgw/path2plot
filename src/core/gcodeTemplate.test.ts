import { describe, expect, it } from 'vitest'
import { renderGcodeTemplate } from './gcodeTemplate'

describe('renderGcodeTemplate', () => {
  it('{x} {y} {z} {f}を対応する値に展開する', () => {
    const result = renderGcodeTemplate('G00 X{x} Y{y} Z{z} F{f}', {
      x: 12.5,
      y: -3,
      z: 9,
      f: 750,
    })
    expect(result).toBe('G00 X12.5 Y-3 Z9 F750')
  })

  it('複数行・複数箇所の同一変数をすべて展開する', () => {
    const result = renderGcodeTemplate('G00 Z{z} F720\nG00 X{x} Y{x}', {
      z: 30,
      x: 5,
    })
    expect(result).toBe('G00 Z30 F720\nG00 X5 Y5')
  })

  it('varsに存在しない変数はプレースホルダのまま残す', () => {
    const result = renderGcodeTemplate('G00 X{x} Y{y}', { x: 1 })
    expect(result).toBe('G00 X1 Y{y}')
  })
})
