import type { Point, ViewBox } from '../geometry/types'
import type { FillCandidate } from '../fill/types'

/**
 * 描画命令に正規化したパスコマンド。SVGのd属性が持つ相対座標・省略記法・二次ベジェ・円弧は
 * すべてこの4種(絶対座標のM/L/C/Z)へ畳んでから扱う
 */
export type PathCommand =
  | { type: 'M'; point: Point }
  | { type: 'L'; point: Point }
  | { type: 'C'; c1: Point; c2: Point; point: Point }
  | { type: 'Z' }

/** M区切りのサブパス1本分。closedは明示的なZコマンドで閉じられた場合のみtrue(始点=終点の一致からの推測はしない) */
export interface Polyline {
  points: Point[]
  closed: boolean
}

export type FillRule = 'nonzero' | 'evenodd'

/** 要素に効いているstroke/fill関連のプレゼンテーション属性を、親からの継承込みで解決した状態 */
export interface StrokeFillState {
  stroke: string
  fill: string
  fillRule: FillRule
  strokeWidth: number
  strokeOpacity: number
  fillOpacity: number
  visible: boolean
}

export interface ParseSettings {
  /** SVGのユーザー単位を1インチとみなす基準DPI */
  dpi: number
  /** DPI換算に加えて掛け合わせる倍率 */
  scaleFactor: number
  /** ベジェ曲線折線化の許容誤差(mm) */
  bezierToleranceMm: number
  /** 配置位置のXオフセット(mm、プリンタ座標系に対する平行移動) */
  offsetXMm: number
  /** 配置位置のYオフセット(mm、プリンタ座標系に対する平行移動) */
  offsetYMm: number
}

export const DEFAULT_PARSE_SETTINGS: ParseSettings = {
  // Illustrator書き出しSVGの標準的な座標系(1 user unit = 1pt = 1/72インチ)に合わせた既定値
  dpi: 72,
  scaleFactor: 1,
  bezierToleranceMm: 0.1,
  offsetXMm: 0,
  offsetYMm: 0,
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
