import type { Point } from './geometry'
import type { FillRule } from '../core/styleResolve'

/** FR-16: fill可視な要素1つから得られる、未解決(穴/外形混在)の閉subpath群 */
export interface FillCandidate {
  id: string
  sourceId?: string
  fillColor: string
  fillRule: FillRule
  contours: Point[][]
}

/**
 * FR-17/18/19/20/21のハッチング設定。ペン(レイヤー)概念導入(Phase7)前は、
 * 唯一のペンの設定として全体で共有する(FR-14のjoinDistanceMmと同じ簡略化パターン)。
 * FR-19/FR-20の「ペン線幅が入力されていれば」の分岐は、線幅入力欄自体がPhase7まで
 * 存在しないため、Phase5では常に不使用(フォールバック値のみを使う)。
 */
export interface FillSettings {
  angleDeg: number
  zigzag: boolean
  spacingMm: number
  overlapPercent: number
  contourOffsetMm: number
  drawOutline: boolean
  /**
   * FR-18: ジグザグ結合の許容距離を「線間隔(spacingMm) × この倍率」として算出する。
   * 角度によってはハッチ行の幅が行ごとに変化し(45°の矩形など)、隣接行の最短距離が
   * 幾何学的に線間隔そのものを超えるため、等倍(1.0)では接続できないケースがある。
   * 形状・角度によって必要な倍率が変わるため、実際のプレビューを見ながら調整する前提の値
   */
  zigzagToleranceFactor: number
}

export const DEFAULT_FILL_SETTINGS: FillSettings = {
  angleDeg: 45,
  zigzag: false,
  spacingMm: 0.5,
  overlapPercent: 0,
  contourOffsetMm: 0,
  drawOutline: true,
  zigzagToleranceFactor: 1.5,
}

/** FR-20: 輪郭オフセットがClipperの返り値から形状破綻と判定された場合のエラー */
export interface FillGeometryError {
  fillBlockId: string
  sourceId?: string
  kind: 'collapsed' | 'split'
  message: string
}

/** FR-22: 閉図形1つ=1つの塗りブロック。ブロック単位で書き順並び替え対象とする */
export interface FillBlock {
  id: string
  sourceId?: string
  color: string
  /** drawOutline=falseまたはerror発生時はnull。穴の境界も含め全輪郭(各配列は閉ループ、始点=終点) */
  outlineLoops: Point[][] | null
  /** 常に0本以上。zigzag=falseなら各ハッチ線が個別チェーン。error発生時は空配列 */
  hatchChains: Point[][]
  error?: FillGeometryError
}
