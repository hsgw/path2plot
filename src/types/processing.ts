import type { JoinedBlock } from '../core/pathOptimize'
import type { FillBlock, FillCandidate, FillSettings } from './fill'
import type { ParsedStroke } from './svg'

/** src/core/processing.worker.tsとApp.tsx間で共有する、重い処理(塗りブロック生成〜端点結合)の
 * オフロード用メッセージ型。SVGパース自体はDOMParserがWorkerのグローバルスコープで利用できない
 * ため対象外とし(実機検証で確認済み)、パース済みのstrokes/fillCandidatesを受け取ってbuildFillBlocks→
 * buildJoinedBlocksの2フェーズを実行する */
export interface ProcessingRequest {
  requestId: number
  strokes: ParsedStroke[]
  fillCandidates: FillCandidate[]
  fillSettings: FillSettings
  joinDistanceMm: number
  joinOverrides: Map<string, boolean>
}

export type ProcessingPhase = 'fill' | 'join'

export interface ProcessingProgressMessage {
  requestId: number
  type: 'progress'
  phase: ProcessingPhase
  percent: number
}

export interface ProcessingDoneMessage {
  requestId: number
  type: 'done'
  fillBlocks: FillBlock[]
  blocks: JoinedBlock[]
}

export type ProcessingResponse =
  ProcessingProgressMessage | ProcessingDoneMessage
