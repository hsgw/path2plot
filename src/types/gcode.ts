export interface GcodeTemplates {
  /** 起動部(FR-30/32)。変数: {z}=トラベルZ */
  start: string
  /** 終了部(FR-30/32)。変数: {x}{y}=パーク位置、{f}=移動速度。パーク退避Z(参考値80)はFR-32の変数対象外のため直値で記述する */
  end: string
  /** ペンダウン(FR-30/32)。変数: {z}=ペンダウンZ、{f}=ペン上下速度 */
  penDown: string
  /** ペンアップ(FR-30/32)。変数: {z}=ペンアップZ、{f}=ペン上下速度 */
  penUp: string
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
  /** ペン交換パーク位置X(mm、FR-30/31参考値) */
  parkX: number
  /** ペン交換パーク位置Y(mm、FR-30/31参考値) */
  parkY: number
  templates: GcodeTemplates
}

export const DEFAULT_GCODE_TEMPLATES: GcodeTemplates = {
  start: 'M3\nG21\nG90\nG28 W\nG00 Z{z} F720',
  end: 'G00 Z80 F720\nG00 X{x} Y{y} F{f}\nM5\nM84\nM2',
  penDown: 'G00 Z{z} F{f}',
  penUp: 'G00 Z{z} F{f}',
}

/** vpype.toml準拠+実機確定値(FR-31、reference/implementation-status.md Phase3参照) */
export const DEFAULT_GCODE_SETTINGS: GcodeSettings = {
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
  // OQ-9未確定のため参考値
  parkX: 85,
  parkY: 175,
  templates: DEFAULT_GCODE_TEMPLATES,
}
