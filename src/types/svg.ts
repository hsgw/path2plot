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

/** ストローク並び順リストの1行(FR-22: 塗りブロックはFR-23のステップ上も常にブロック単位で1行のみ。
 * hatchLineCount/outlineLoopCountは、リスト上でブロックを展開したときに表示する子行の本数) */
export interface FillListEntry {
  kind: 'fill'
  blockId: number
  id: string
  sourceId?: string
  color: string
  hatchLineCount: number
  /** drawOutline=falseやFR-20の形状破綻エラー時は0 */
  outlineLoopCount: number
  error?: FillGeometryError
}

export type ListEntry = StrokeListEntry | FillListEntry

/**
 * FR-43: ストローク並び順リスト上で選択/ホバーされた行を指す。listEntries上の連続範囲で表し、
 * 塗りブロックを展開して個別の輪郭線・ハッチ線を指す場合のみsegmentOffset(そのブロック内での
 * 物理セグメント番号)を持つ。keyは行を一意に識別する文字列で、選択/ホバー状態の比較にのみ使う
 */
export interface HighlightSelection {
  key: string
  entryIndex: number
  /** 対象とするListEntryの数(結合ブロック行なら本数、それ以外は1) */
  entryCount: number
  segmentOffset?: number
}

/** HighlightSelectionをプレビューのセグメント番号に変換した範囲 [start, end) */
export interface HighlightRange {
  start: number
  end: number
}

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
