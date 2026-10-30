import type { Point } from '../geometry/types'

/** 1回のペンダウン〜ペンアップで連続描画する点列(FR-14の結合ブロック単位) */
export type DrawGroup = Point[]

/** 描画可能領域の大きさ(FR-35)。原点(0,0)を左下とするローカル座標で扱う */
export interface BedSize {
  widthMm: number
  heightMm: number
}

/** FR-38: 描画可能領域からはみ出したストローク/塗り候補1件分の警告 */
export interface OutOfBoundsWarning {
  kind: 'stroke' | 'fill'
  /** kind内での出現順index */
  index: number
  id: string
  sourceId?: string
  /** はみ出した点 */
  points: Point[]
}

/**
 * テンプレートgcode本体(FR-30/32)。
 * 各テンプレートで使える変数は共通で、{@link GcodeSettings}の数値項目(templatesを除く)を
 * そのままのキー名(例: {travelZ}{penDownZ}{penFeedRate}{parkX}等)で展開する(generate.ts参照)。
 * どのテンプレートでも同じ変数名は同じ値を指す。デフォルトテンプレートで未使用の変数も展開対象。
 * さらにtravelMove/drawMoveの2つだけは移動先座標{x}{y}も使える(この2つ以外では未定義)。
 */
export interface GcodeTemplates {
  /** 起動部(FR-30/32) */
  start: string
  /** 移動(FR-29/32)。結合ブロックの先頭点への移動(ペンアップ状態)1回分。変数{x}{y}=移動先座標 */
  travelMove: string
  /** ペンダウン(FR-30/32) */
  penDown: string
  /** 描画(FR-29/32)。結合ブロック内の点への移動(ペンダウン状態)1回分。変数{x}{y}=移動先座標 */
  drawMove: string
  /** ペンアップ(FR-30/32) */
  penUp: string
  /** 終了部(FR-30/32)。パーク退避Z(参考値80)はFR-32の変数対象外のため直値で記述する */
  end: string
}

export interface GcodeSettings {
  /** 描画速度 F(FR-31/32) */
  drawFeedRate: number
  /** 移動速度 F(FR-31/32) */
  travelFeedRate: number
  /** ペン上下速度 F(FR-31/32) */
  penFeedRate: number
  /** ペンダウンZ(mm、FR-31/37) */
  penDownZ: number
  /** ペンアップZ(mm、FR-31) */
  penUpZ: number
  /** トラベルZ(mm、FR-31) */
  travelZ: number
  /** 描画加速度 M204 P(FR-31/32、OQ-8確定待ちにつき暫定値) */
  drawAccel: number
  /** 移動加速度 M204 T(FR-31/32、OQ-8/OQ-12確定待ちにつき暫定値) */
  travelAccel: number
  /** XYジャーク M205 X/Y(FR-31/32、OQ-8/OQ-11確定待ちにつき暫定値) */
  xyJerk: number
  /** 最小セグメント長(mm、FR-34) */
  minSegmentLengthMm: number
  /** 描画可能領域の幅(mm、FR-35) */
  bedWidthMm: number
  /** 描画可能領域の高さ(mm、FR-35) */
  bedHeightMm: number
  /**
   * 描画可能領域のローカル原点(0,0)に対応する機械絶対座標X(mm)。
   * G28 W後のファームウェア原点と、紙・治具が実際に貼られている位置がズレているため、
   * G-code出力時に描画・移動座標へこの値を加算する(はみ出し判定はローカル座標のまま行う)
   */
  bedOriginXMm: number
  /** 描画可能領域のローカル原点(0,0)に対応する機械絶対座標Y(mm)。bedOriginXMm参照 */
  bedOriginYMm: number
  /** G-code出力時にローカルYをベッド高さ基準で反転する(プレビュー座標は変更しない) */
  flipY: boolean
  /** ペン交換パーク位置X(mm、FR-30/31参考値) */
  parkX: number
  /** ペン交換パーク位置Y(mm、FR-30/31参考値) */
  parkY: number
  templates: GcodeTemplates
}

export const PRUSA_PEN_GCODE_TEMPLATES: GcodeTemplates = {
  start: 'M3\nG21\nG90\nG28 W\nG00 Z{travelZ} F720',
  travelMove: 'G00 X{x} Y{y} F{travelFeedRate}',
  penDown: 'G00 Z{penDownZ} F{penFeedRate}',
  drawMove: 'G01 X{x} Y{y} F{drawFeedRate}',
  penUp: 'G00 Z{penUpZ} F{penFeedRate}',
  end: 'G00 Z80 F720\nG00 X{parkX} Y{parkY} F{travelFeedRate}\nM5\nM84\nM2',
}

/** vpype.toml準拠+実機確定値(FR-31、reference/implementation-status.md Phase3参照) */
/** 従来のPrusa MK3S向け設定。既存ユーザー向けプリセットとして保持する */
export const PRUSA_PEN_GCODE_SETTINGS: GcodeSettings = {
  drawFeedRate: 4500,
  travelFeedRate: 10000,
  penFeedRate: 750,
  // 実機テスト確定値(2026-07-13時点、down<up<travelの通常の並び)
  penDownZ: 19,
  penUpZ: 23,
  travelZ: 30,
  // OQ-8未確定のため暫定値。実機確認後に確定する
  drawAccel: 500,
  travelAccel: 1000,
  xyJerk: 10,
  minSegmentLengthMm: 0.1,
  // 実機テスト確定値(2026-07-13時点)。実測の描画可能領域X44-255/Y30-195から安全マージンとして
  // 上下左右5mmずつ内側に狭めた値(X49-250/Y35-190)を採用
  bedWidthMm: 201,
  bedHeightMm: 155,
  bedOriginXMm: 49,
  bedOriginYMm: 35,
  flipY: false,
  // OQ-9未確定のため参考値
  parkX: 85,
  parkY: 175,
  templates: PRUSA_PEN_GCODE_TEMPLATES,
}

export const DEFAULT_GCODE_TEMPLATES: GcodeTemplates = {
  start: 'G90\nG28\nPEN_UP',
  travelMove: 'M204 S{travelAccel}\nG0 X{x} Y{y} F{travelFeedRate}',
  penDown: 'PEN_DOWN',
  drawMove: 'M204 S{drawAccel}\nG1 X{x} Y{y} F{drawFeedRate}',
  penUp: 'PEN_UP',
  end: 'PEN_UP\nPLOT_END',
}

/** 新しいペンプロッター向け既定値 */
export const DEFAULT_GCODE_SETTINGS: GcodeSettings = {
  drawFeedRate: 24000,
  travelFeedRate: 24000,
  penFeedRate: 750,
  penDownZ: 19,
  penUpZ: 23,
  travelZ: 30,
  drawAccel: 7000,
  travelAccel: 8000,
  xyJerk: 10,
  minSegmentLengthMm: 0.1,
  bedWidthMm: 89,
  bedHeightMm: 53,
  bedOriginXMm: 3,
  bedOriginYMm: 14,
  flipY: true,
  parkX: 0,
  parkY: 0,
  templates: DEFAULT_GCODE_TEMPLATES,
}
