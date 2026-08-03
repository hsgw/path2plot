import type { Point } from '../geometry/types'
import type { FillRule } from '../svg/types'

/** FR-16: fill可視な要素1つから得られる、未解決(穴/外形混在)の閉subpath群 */
export interface FillCandidate {
  id: string
  sourceId?: string
  fillColor: string
  fillRule: FillRule
  contours: Point[][]
}

/**
 * FR-17: 塗りつぶし方式。
 * 'hatch'      … 平行線ハッチ(クロスハッチ・波形・連結モードは下記の各設定で切り替える)
 * 'concentric' … 輪郭を線間隔ずつ内側へオフセットした同心リング群
 * 'spiral'     … 同心リングを1本につないだ簡易スパイラル
 */
export type FillPattern = 'hatch' | 'concentric' | 'spiral'

/** ハッチ1行の線の形状。connect==='zigzag'では行の端点しか使わないため結果に現れない */
export type HatchWaveform = 'straight' | 'sine' | 'triangle'

/**
 * FR-18: ハッチ線の連結方法。
 * 'none'          … 各ハッチ線を個別に描き、間はペンアップ移動する
 * 'zigzag'        … 各行の左右の端点を交互に拾い斜めに繋ぐ一筆書き(L0→R1→L2→R3…)。
 *                   ハッチ線そのものは描かない
 * 'boustrophedon' … ハッチ線を描き、隣接行の同じ側の端点同士を繋ぐ往復(牛耕式)
 */
export type HatchConnectMode = 'none' | 'zigzag' | 'boustrophedon'

/**
 * FR-17/18/19/20/21の塗りつぶし設定。ペン(レイヤー)概念導入(Phase7)前は、
 * 唯一のペンの設定として全体で共有する(FR-14のjoinDistanceMmと同じ簡略化パターン)。
 * FR-19/FR-20の「ペン線幅が入力されていれば」の分岐は、線幅入力欄自体がPhase7まで
 * 存在しないため、現時点では常に不使用(フォールバック値のみを使う)。
 *
 * パターン固有のパラメータもフラットに保持し、UI側を条件表示で切り替える。
 * Phase7でペンごとの「コピー方式」へ移す際に型の再設計が要らないようにするため。
 */
export interface FillSettings {
  /** falseの場合、fill付き閉パスがあっても塗りブロック(輪郭線・塗り線とも)を一切生成しない */
  enabled: boolean
  pattern: FillPattern

  // --- hatch 共通 ---
  angleDeg: number
  /** ハッチの線間隔。concentric/spiralではリング間隔として共用する */
  spacingMm: number
  /** trueの場合、angleDegとcrossAngleDegの2方向のハッチを重ねる */
  crossHatch: boolean
  /** クロスハッチの第2方向の絶対角度(angleDegからの相対ではない) */
  crossAngleDeg: number

  // --- hatch 波形 ---
  waveform: HatchWaveform
  /**
   * 走査線に対する垂直方向の片振幅。線間隔の半分を超えると隣接行と干渉するため、
   * 生成時に spacingMm/2 でクランプされる
   */
  waveAmplitudeMm: number
  waveLengthMm: number
  /** waveform==='sine'のみで使用。1周期あたりの分割数 */
  waveSegmentsPerCycle: number

  // --- 連結 ---
  /**
   * ジグザグには距離のしきい値がない(斜めの接続線は行の長さに比例して長くなるため、
   * 線間隔基準の判定が意味をなさない)。塗り領域からはみ出すかだけで分割を決める
   */
  connect: HatchConnectMode
  /**
   * connect==='boustrophedon'のみで使用。次に繋ぐ断片を探す範囲(端点までの直線距離)の上限を
   * 「線間隔(spacingMm) × この倍率」として算出する。なぞる距離ではなく直線距離を基準にするのは、
   * 複雑で小さな図形では「すぐ隣なのに輪郭を大きく回り込む」経路が現れ、なぞり距離で切ると
   * 却って遠くへ繋ぎ直してしまうため。
   * 「標準順で直後の断片」(リスト上の次のライン)への接続は、往復そのものが成立しなくなるため
   * 上限を超えても許容する。斜めの角度では隣接行の端点間が最低でも線間隔×√2(≒1.41)
   * 離れるため、既定は3とする
   */
  connectDistanceFactor: number

  // --- 共通 ---
  overlapPercent: number
  fillOffsetMm: number
  drawOutline: boolean
}

export const DEFAULT_FILL_SETTINGS: FillSettings = {
  enabled: true,
  pattern: 'hatch',
  angleDeg: 45,
  spacingMm: 0.5,
  crossHatch: false,
  crossAngleDeg: 135,
  waveform: 'straight',
  waveAmplitudeMm: 0.25,
  waveLengthMm: 2,
  waveSegmentsPerCycle: 8,
  connect: 'none',
  connectDistanceFactor: 3,
  overlapPercent: 0,
  fillOffsetMm: 0,
  drawOutline: false,
}

/** FR-20: 塗りオフセットがClipperの返り値から形状破綻と判定された場合のエラー */
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
  /**
   * 塗りを構成する線。1要素=1回のペンダウン〜アップ。
   * hatchなら連結モードに応じた本数、concentricならリング本数、spiralなら通常1本。
   * error発生時は空配列
   */
  fillChains: Point[][]
  error?: FillGeometryError
}
