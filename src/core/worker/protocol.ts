import type { JoinedBlock } from '../plan/types'
import type { FillBlock, FillCandidate, FillSettings } from '../fill/types'
import type { ParsedStroke } from '../svg/types'

/** processing.worker.tsとメインスレッド(app/useProcessing.ts)間で共有する、
 * 重い処理(塗りブロック生成・端点結合)の
 * オフロード用メッセージ型。パース済みのstrokes/fillCandidatesを受け取って
 * buildFillBlocks(kind: 'fill')・buildJoinedBlocks(kind: 'join')をそれぞれ独立に実行する。
 * fillは設定変更に追従して自動実行される一方、joinは有効な場合だけ
 * リクエストされるので、2つのリクエスト系統は
 * 互いに独立してpostMessageされる */
export interface FillProcessingRequest {
  kind: 'fill'
  requestId: number
  fillCandidates: FillCandidate[]
  fillSettings: FillSettings
  fillOverrides: Map<string, Partial<FillSettings>>
}

export interface JoinProcessingRequest {
  kind: 'join'
  requestId: number
  strokes: ParsedStroke[]
  joinDistanceMm: number
  joinOverrides: Map<string, boolean>
  allowReverse: boolean
}

export type ProcessingRequest = FillProcessingRequest | JoinProcessingRequest

export type ProcessingPhase = 'fill' | 'join'

export interface ProcessingProgressMessage {
  requestId: number
  type: 'progress'
  phase: ProcessingPhase
  percent: number
}

export interface FillDoneMessage {
  requestId: number
  type: 'fill-done'
  fillBlocks: FillBlock[]
}

export interface JoinDoneMessage {
  requestId: number
  type: 'join-done'
  blocks: JoinedBlock[]
}

export type ProcessingResponse =
  ProcessingProgressMessage | FillDoneMessage | JoinDoneMessage
