import type { Point, ViewBox } from './geometry'

export interface ParseSettings {
  /** SVGのユーザー単位を1インチとみなす基準DPI(既定96) */
  dpi: number
  /** DPI換算に加えて掛け合わせる倍率(既定1) */
  scaleFactor: number
  /** ベジェ曲線折線化の許容誤差(mm) */
  bezierToleranceMm: number
}

export interface ParsedStroke {
  id: string
  sourceId?: string
  points: Point[]
  /** FR-26: プレビュー表示用の実際の色(stroke優先、なければfill) */
  color: string
}

export type SvgParseErrorKind = 'parse-error' | 'unsupported-element'

export interface SvgParseError {
  kind: SvgParseErrorKind
  message: string
  elementTag?: string
  elementId?: string
  elementIndex?: number
  line?: number
  column?: number
}

export interface SvgParseResult {
  strokes: ParsedStroke[]
  errors: SvgParseError[]
  viewBox: ViewBox
}

/** FR-14: 結合ブロック適用・並び替え後のストローク。blockIdが同じものは同一の結合ブロックに属する */
export interface OrderedStroke extends ParsedStroke {
  blockId: number
}
