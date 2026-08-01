import type { ProcessingRequest, ProcessingResponse } from './protocol'
import { buildFillBlocks } from '../fill/fillBlock'
import { buildJoinedBlocks } from '../plan/strokeJoin'

function post(message: ProcessingResponse): void {
  self.postMessage(message)
}

self.onmessage = (event: MessageEvent<ProcessingRequest>) => {
  const request = event.data

  if (request.kind === 'fill') {
    const { requestId, fillCandidates, fillSettings } = request
    post({ requestId, type: 'progress', phase: 'fill', percent: 0 })
    const fillBlocks = buildFillBlocks(fillCandidates, fillSettings)
    post({ requestId, type: 'fill-done', fillBlocks })
    return
  }

  const { requestId, strokes, joinDistanceMm, joinOverrides } = request
  post({ requestId, type: 'progress', phase: 'join', percent: 0 })
  const blocks = buildJoinedBlocks(strokes, joinDistanceMm, joinOverrides)
  post({ requestId, type: 'join-done', blocks })
}
