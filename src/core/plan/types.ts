import type { Point } from '../geometry/types'
import type { FillBlock, FillGeometryError } from '../fill/types'
import type { ParsedStroke } from '../svg/types'

export interface BlockMember {
  strokeIndex: number
  /** true: このストロークをブロック内で元のpoints順とは逆向きに辿る */
  reversed: boolean
}

/** FR-14: 端点が近いストローク同士をひとつながりにまとめた結合ブロック */
export interface JoinedBlock {
  members: BlockMember[]
}

/** 書き順並び替え(FR-15)の対象となる1ユニット。FR-14の結合ブロック、またはFR-22の塗りブロック */
export type DrawUnit =
  | { kind: 'joinedStroke'; block: JoinedBlock }
  | { kind: 'fill'; fillBlock: FillBlock }

export interface MaterializedDrawUnit {
  kind: 'joinedStroke' | 'fill'
  color: string
  sourceId?: string
  /** kind==='joinedStroke'の場合のみ。ブロックを構成する個別ストローク(リスト表示単位) */
  strokes?: ParsedStroke[]
  /** kind==='fill'の場合のみ。リスト表示用のサマリ情報(向き反転は反映されない) */
  fillBlock?: FillBlock
  /**
   * G-code出力・実際のペン上げ下げ単位(1配列要素=1回のペンダウン〜アップ、向き反転も反映済み)。
   * joinedStrokeなら常に長さ1。fillならoutlineLoops+fillChainsの本数(0の場合もある、FR-20エラー時)
   */
  gcodeSegments: Point[][]
}

/**
 * 並び替え結果の共通形。orderは元の添字を訪問順に並べたもの、
 * reversedは訪問順の位置ごとの向き反転フラグ(order[i]をreversed[i]の向きで辿る)
 */
export interface SequenceOrder {
  order: number[]
  reversed: boolean[]
}

/**
 * FR-15の貪欲法で決まった、ユニットの訪問順と各ユニットの向き反転フラグ。
 * innerOrdersは塗りブロック(FR-22)の内部セグメントの並び替え結果を、
 * ユニットと同じ訪問順の位置で保持する(内部を並び替えないユニットはnull)
 */
export interface UnitOrder extends SequenceOrder {
  innerOrders?: (SequenceOrder | null)[]
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
 * fillChainCount/outlineLoopCountは、リスト上でブロックを展開したときに表示する子行の本数) */
export interface FillListEntry {
  kind: 'fill'
  blockId: number
  id: string
  sourceId?: string
  color: string
  /** FR-17の塗りつぶし方式の短い表記(describeFillPatternの結果) */
  patternLabel: string
  fillChainCount: number
  /** drawOutline=falseやFR-20の形状破綻エラー時は0 */
  outlineLoopCount: number
  /** このfillに個別上書きが設定済みか(リストの元に戻すアイコン・メニューの「手動」バッジに使う) */
  overridden: boolean
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
