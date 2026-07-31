import type { ProcessingRequest, ProcessingResponse } from '../types/processing'
import { buildFillBlocks } from './fillBlock'
import { buildJoinedBlocks } from './pathOptimize'

function post(message: ProcessingResponse): void {
  self.postMessage(message)
}

self.onmessage = (event: MessageEvent<ProcessingRequest>) => {
  const {
    requestId,
    strokes,
    fillCandidates,
    fillSettings,
    joinDistanceMm,
    joinOverrides,
  } = event.data

  post({ requestId, type: 'progress', phase: 'fill', percent: 0 })
  const fillBlocks = buildFillBlocks(fillCandidates, fillSettings)

  post({ requestId, type: 'progress', phase: 'join', percent: 50 })
  const blocks = buildJoinedBlocks(strokes, joinDistanceMm, joinOverrides)

  post({ requestId, type: 'done', fillBlocks, blocks })
}
