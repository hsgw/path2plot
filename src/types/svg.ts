import type { Point, ViewBox } from './geometry'
import type { FillCandidate, FillGeometryError } from './fill'

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
  /** FR-16: fill可視な要素の閉パス候補(穴/外形はまだ未解決) */
  fillCandidates: FillCandidate[]
  errors: SvgParseError[]
  viewBox: ViewBox
}

/** FR-14: 結合ブロック適用・並び替え後のストローク。blockIdが同じものは同一の結合ブロックに属する */
export interface OrderedStroke extends ParsedStroke {
  blockId: number
}

/** ストローク並び順リストの1行(FR-14の結合ブロック由来、個別ストローク単位) */
export interface StrokeListEntry extends OrderedStroke {
  kind: 'stroke'
}

/** ストローク並び順リストの1行(FR-22: 塗りブロックは常にブロック単位で1行のみ) */
export interface FillListEntry {
  kind: 'fill'
  blockId: number
  id: string
  sourceId?: string
  color: string
  hatchLineCount: number
  hasOutline: boolean
  error?: FillGeometryError
}

export type ListEntry = StrokeListEntry | FillListEntry

/**
 * プレビュー描画用の物理セグメント(1要素=1回の実際のペン上げ下げ)。G-code出力の
 * DrawGroup granularityと一致する(結合ブロックは常に1セグメント、塗りブロックは
 * 輪郭線+ハッチ本数分のセグメントを持つ)。penLiftBeforeは直前のセグメントとの間に
 * 実際のペンアップ移動が発生するかどうかを表す(FR-14の結合ブロック内部ではfalse)。
 */
export interface PreviewSegment {
  blockId: number
  points: Point[]
  color: string
  penLiftBefore: boolean
}
