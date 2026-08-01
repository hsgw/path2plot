import type { Point } from '../geometry/types'
import type { PathCommand } from './types'
import { arcToCubicSegments } from '../geometry/arc'
import { quadraticToCubicControls } from '../geometry/bezier'

const NUMBER_RE = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/

class ArgScanner {
  private pos = 0
  private readonly str: string

  constructor(str: string) {
    this.str = str
  }

  private skipSeparators(): void {
    while (this.pos < this.str.length && /[\s,]/.test(this.str[this.pos]))
      this.pos++
  }

  hasMore(): boolean {
    this.skipSeparators()
    return this.pos < this.str.length
  }

  nextNumber(): number {
    this.skipSeparators()
    const rest = this.str.slice(this.pos)
    const m = NUMBER_RE.exec(rest)
    if (!m || m[0] === '')
      throw new Error(`パスの数値解析に失敗しました: "${rest.slice(0, 20)}"`)
    this.pos += m[0].length
    return Number(m[0])
  }

  nextFlag(): number {
    this.skipSeparators()
    const ch = this.str[this.pos]
    if (ch !== '0' && ch !== '1') {
      throw new Error(
        `パスの弧フラグ(0/1)の解析に失敗しました: "${this.str.slice(this.pos, this.pos + 10)}"`,
      )
    }
    this.pos++
    return Number(ch)
  }
}

const COMMAND_LETTERS = 'MLHVCSQTAZmlhvcsqtaz'

/** SVGパスのd属性を(未変換ローカル座標のままの)PathCommand列へ変換する */
export function parsePathData(d: string): PathCommand[] {
  const commands: PathCommand[] = []

  let current: Point = { x: 0, y: 0 }
  let subpathStart: Point = { x: 0, y: 0 }
  let prevCubicControl: Point | null = null
  let prevQuadControl: Point | null = null
  let prevCommand = ''

  const tokenRe = new RegExp(
    `([${COMMAND_LETTERS}])([^${COMMAND_LETTERS}]*)`,
    'g',
  )

  for (const match of d.matchAll(tokenRe)) {
    const letter = match[1]
    const isRelative = letter === letter.toLowerCase()
    const cmd = letter.toUpperCase()
    const scanner = new ArgScanner(match[2])

    const resolve = (x: number, y: number): Point =>
      isRelative ? { x: current.x + x, y: current.y + y } : { x, y }

    let iterationIndex = 0
    while (cmd === 'Z' ? iterationIndex === 0 : scanner.hasMore()) {
      const isFirstIteration = iterationIndex === 0
      iterationIndex++

      switch (cmd) {
        case 'M': {
          // 最初の座標対はmoveto、同一コマンド内で続く座標対は暗黙のlineto扱い
          const p = resolve(scanner.nextNumber(), scanner.nextNumber())
          if (isFirstIteration) {
            commands.push({ type: 'M', point: p })
            subpathStart = p
          } else {
            commands.push({ type: 'L', point: p })
          }
          current = p
          prevCubicControl = null
          prevQuadControl = null
          prevCommand = 'M'
          continue
        }
        case 'L': {
          const p = resolve(scanner.nextNumber(), scanner.nextNumber())
          commands.push({ type: 'L', point: p })
          current = p
          prevCubicControl = null
          prevQuadControl = null
          prevCommand = 'L'
          continue
        }
        case 'H': {
          const x = scanner.nextNumber()
          const p = { x: isRelative ? current.x + x : x, y: current.y }
          commands.push({ type: 'L', point: p })
          current = p
          prevCubicControl = null
          prevQuadControl = null
          prevCommand = 'H'
          continue
        }
        case 'V': {
          const y = scanner.nextNumber()
          const p = { x: current.x, y: isRelative ? current.y + y : y }
          commands.push({ type: 'L', point: p })
          current = p
          prevCubicControl = null
          prevQuadControl = null
          prevCommand = 'V'
          continue
        }
        case 'C': {
          const c1 = resolve(scanner.nextNumber(), scanner.nextNumber())
          const c2 = resolve(scanner.nextNumber(), scanner.nextNumber())
          const p = resolve(scanner.nextNumber(), scanner.nextNumber())
          commands.push({ type: 'C', c1, c2, point: p })
          current = p
          prevCubicControl = c2
          prevQuadControl = null
          prevCommand = 'C'
          continue
        }
        case 'S': {
          const c1 =
            prevCommand === 'C' || prevCommand === 'S'
              ? {
                  x: 2 * current.x - prevCubicControl!.x,
                  y: 2 * current.y - prevCubicControl!.y,
                }
              : current
          const c2 = resolve(scanner.nextNumber(), scanner.nextNumber())
          const p = resolve(scanner.nextNumber(), scanner.nextNumber())
          commands.push({ type: 'C', c1, c2, point: p })
          current = p
          prevCubicControl = c2
          prevQuadControl = null
          prevCommand = 'S'
          continue
        }
        case 'Q': {
          const q1 = resolve(scanner.nextNumber(), scanner.nextNumber())
          const p = resolve(scanner.nextNumber(), scanner.nextNumber())
          const { c1, c2 } = quadraticToCubicControls(current, q1, p)
          commands.push({ type: 'C', c1, c2, point: p })
          current = p
          prevQuadControl = q1
          prevCubicControl = null
          prevCommand = 'Q'
          continue
        }
        case 'T': {
          const q1: Point =
            prevCommand === 'Q' || prevCommand === 'T'
              ? {
                  x: 2 * current.x - prevQuadControl!.x,
                  y: 2 * current.y - prevQuadControl!.y,
                }
              : current
          const p = resolve(scanner.nextNumber(), scanner.nextNumber())
          const { c1, c2 } = quadraticToCubicControls(current, q1, p)
          commands.push({ type: 'C', c1, c2, point: p })
          current = p
          prevQuadControl = q1
          prevCubicControl = null
          prevCommand = 'T'
          continue
        }
        case 'A': {
          const rx = scanner.nextNumber()
          const ry = scanner.nextNumber()
          const xAxisRotation = scanner.nextNumber()
          const largeArcFlag = scanner.nextFlag()
          const sweepFlag = scanner.nextFlag()
          const p = resolve(scanner.nextNumber(), scanner.nextNumber())
          const segments = arcToCubicSegments(
            current,
            p,
            rx,
            ry,
            xAxisRotation,
            largeArcFlag,
            sweepFlag,
          )
          for (const seg of segments) {
            commands.push({
              type: 'C',
              c1: seg.c1,
              c2: seg.c2,
              point: seg.point,
            })
          }
          current = p
          prevCubicControl = null
          prevQuadControl = null
          prevCommand = 'A'
          continue
        }
        case 'Z': {
          commands.push({ type: 'Z' })
          current = subpathStart
          prevCubicControl = null
          prevQuadControl = null
          prevCommand = 'Z'
          continue
        }
        default:
          continue
      }
    }
  }

  return commands
}
