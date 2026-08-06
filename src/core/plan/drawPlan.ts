import type { Point } from '../geometry/types'
import type { ParsedStroke } from '../svg/types'
import { materializeDrawUnit } from './drawUnit'
import type { DrawUnit, ListEntry, PreviewSegment, UnitOrder } from './types'

/** プレビュータイトル欄に出す本数の内訳 */
export interface DrawPlanCounts {
  /** 全ストローク総数(通常ストローク+塗りブロック内の線) */
  strokeCount: number
  fillCount: number
  /** strokeCountの内数としての、塗りブロック内の線の本数 */
  fillStrokeCount: number
}

/**
 * 確定した書き順のユニット列から、UI・G-code出力が必要とする表現を一度に組み立てた結果。
 * 同じ materializeDrawUnit の結果から派生する値なので、まとめて1回の走査で作る。
 */
export interface DrawPlan {
  /** ストローク並び順リストの行 */
  listEntries: ListEntry[]
  /** プレビュー描画用のセグメント。結合ブロックは構成ストロークごとに1本ずつ持つ */
  previewSegments: PreviewSegment[]
  /**
   * listEntries[i]までが対応するpreviewSegmentsの本数の累積和(長さ listEntries.length + 1)。
   * ハイライト範囲(FR-43)をO(1)でセグメント番号へ変換するために持つ
   */
  segmentCountPrefix: number[]
  /** G-code出力単位(1要素=1回のペンダウン〜アップ) */
  drawGroups: Point[][]
  counts: DrawPlanCounts
}

/**
 * 並び替え結果(FR-15)を実際に使える順序へ解決する。
 * 最適化後にファイルを読み直した直後など、ユニット構成と長さが食い違うタイミングが
 * 1レンダリングだけ生じうるため、長さが一致しない並び替え結果は破棄して出現順に戻す
 * (塗りブロック内部の並び替え結果は本数の検証をmaterializeDrawUnit側で行う)。
 */
function resolveUnitOrder(
  unitOrder: UnitOrder | null,
  count: number,
): UnitOrder {
  if (
    unitOrder !== null &&
    unitOrder.order.length === count &&
    unitOrder.reversed.length === count &&
    (unitOrder.innerOrders === undefined ||
      unitOrder.innerOrders.length === count)
  ) {
    return unitOrder
  }
  return {
    order: Array.from({ length: count }, (_, i) => i),
    reversed: new Array<boolean>(count).fill(false),
  }
}

export function buildDrawPlan(
  units: DrawUnit[],
  strokes: ParsedStroke[],
  unitOrder: UnitOrder | null,
  /** FR-17の塗りつぶし方式の短い表記(fillId→ラベル)。個別上書きでfillごとに変わりうる */
  fillPatternLabels: Map<string, string>,
  /** 個別上書きが設定済みのfill idの集合 */
  overriddenFillIds: Set<string>,
): DrawPlan {
  const { order, reversed, innerOrders } = resolveUnitOrder(
    unitOrder,
    units.length,
  )

  const listEntries: ListEntry[] = []
  const previewSegments: PreviewSegment[] = []
  const segmentCountPrefix: number[] = [0]
  const drawGroups: Point[][] = []
  let plainStrokeCount = 0
  let fillCount = 0
  let fillStrokeCount = 0

  const pushEntry = (entry: ListEntry, segmentCount: number): void => {
    listEntries.push(entry)
    segmentCountPrefix.push(segmentCountPrefix.at(-1)! + segmentCount)
  }

  order.forEach((unitIndex, blockId) => {
    const unit = materializeDrawUnit(
      units[unitIndex],
      strokes,
      reversed[blockId],
      innerOrders?.[blockId] ?? null,
    )
    drawGroups.push(...unit.gcodeSegments)

    if (unit.kind === 'joinedStroke') {
      const blockStrokes = unit.strokes ?? []
      blockStrokes.forEach((stroke, indexInBlock) => {
        pushEntry({ kind: 'stroke', blockId, ...stroke }, 1)
        previewSegments.push({
          blockId,
          points: stroke.points,
          color: stroke.color,
          // FR-25: 結合ブロックの内部ではペンを上げないため、先頭だけがペンアップ移動を伴う
          penLiftBefore: indexInBlock === 0,
        })
      })
      plainStrokeCount += blockStrokes.length
      return
    }

    const fillBlock = unit.fillBlock!
    // FR-22: 塗りブロックはリスト・ステップ上つねに1行(1ステップ)
    pushEntry(
      {
        kind: 'fill',
        blockId,
        id: fillBlock.id,
        sourceId: fillBlock.sourceId,
        color: fillBlock.color,
        patternLabel: fillPatternLabels.get(fillBlock.id) ?? '',
        fillChainCount: fillBlock.fillChains.length,
        outlineLoopCount: fillBlock.outlineLoops?.length ?? 0,
        overridden: overriddenFillIds.has(fillBlock.id),
        error: fillBlock.error,
      },
      unit.gcodeSegments.length,
    )
    for (const points of unit.gcodeSegments) {
      previewSegments.push({
        blockId,
        points,
        color: unit.color,
        penLiftBefore: true,
      })
    }
    fillCount++
    fillStrokeCount += unit.gcodeSegments.length
  })

  return {
    listEntries,
    previewSegments,
    segmentCountPrefix,
    drawGroups,
    counts: {
      strokeCount: plainStrokeCount + fillStrokeCount,
      fillCount,
      fillStrokeCount,
    },
  }
}
