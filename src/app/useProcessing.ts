import { useEffect, useMemo, useRef, useState } from 'react'
import type { FillBlock, FillSettings } from '../core/fill/types'
import { unjoinedBlocks } from '../core/plan/strokeJoin'
import type { JoinedBlock } from '../core/plan/types'
import type { SvgParseResult } from '../core/svg/types'
import type {
  ProcessingPhase,
  ProcessingResponse,
  FillProcessingRequest,
  JoinProcessingRequest,
} from '../core/worker/protocol'

const EMPTY_FILL_BLOCKS: FillBlock[] = []

/**
 * 空Mapの参照を使い回すことで、リセット時にsetJoinOverridesが不要な再postMessageを
 * 引き起こさないようにする(ファイル読込ごとにWorkerが2回起動する不具合の解消)
 */
export const EMPTY_JOIN_OVERRIDES: Map<string, boolean> = new Map()
/** 同上の理由で、塗り個別上書きの空Mapも参照を使い回す */
export const EMPTY_FILL_OVERRIDES: Map<
  string,
  Partial<FillSettings>
> = new Map()

type FillInput = Omit<FillProcessingRequest, 'requestId'>
type JoinInput = Omit<JoinProcessingRequest, 'requestId'>

/** 計算対象を添えて保持し、ファイルや設定の切り替え直後に古い結果を使用しない。 */
interface ProcessedFor<Input, T> {
  input: Input
  value: T
}

interface UseProcessingArgs {
  parseResult: SvgParseResult | null
  fillSettings: FillSettings
  fillOverrides: Map<string, Partial<FillSettings>>
  joinDistanceMm: number
  joinOverrides: Map<string, boolean>
  joinActivated: boolean
  allowReverse: boolean
}

export interface ProcessingState {
  /** FR-22: 塗りブロック。設定変更に追従して自動的に再計算される */
  fillBlocks: FillBlock[]
  /** FR-14: 結合ブロック。パス結合が未実行の間は各ストローク1件ずつのブロック */
  blocks: JoinedBlock[]
  joinActivated: boolean
  isProcessing: boolean
  phase: ProcessingPhase | null
  percent: number
}

/**
 * 塗りブロック生成(buildFillBlocks)・端点結合(buildJoinedBlocks、FR-14)はいずれも重い処理のため、
 * メインスレッドをブロックしないようWeb Workerにオフロードする。
 *
 * fillとjoinは互いに独立したリクエスト系統として扱う: fillは設定変更に追従して自動実行される一方、
 * joinは結合を有効にしている間だけ実行する。
 */
export function useProcessing({
  parseResult,
  fillSettings,
  fillOverrides,
  joinDistanceMm,
  joinOverrides,
  joinActivated,
  allowReverse,
}: UseProcessingArgs): ProcessingState {
  const [fillProcessed, setFillProcessed] = useState<ProcessedFor<
    FillInput,
    FillBlock[]
  > | null>(null)
  const [joinProcessed, setJoinProcessed] = useState<ProcessedFor<
    JoinInput,
    JoinedBlock[]
  > | null>(null)
  const [fillPercent, setFillPercent] = useState(0)
  const [joinPercent, setJoinPercent] = useState(0)

  const fillInput = useMemo<FillInput | null>(
    () =>
      parseResult && {
        kind: 'fill',
        fillCandidates: parseResult.fillCandidates,
        fillSettings,
        fillOverrides,
      },
    [parseResult, fillSettings, fillOverrides],
  )
  const joinInput = useMemo<JoinInput | null>(
    () =>
      joinActivated && parseResult
        ? {
            kind: 'join',
            strokes: parseResult.strokes,
            joinDistanceMm,
            joinOverrides,
            allowReverse,
          }
        : null,
    [joinActivated, parseResult, joinDistanceMm, joinOverrides, allowReverse],
  )

  // fill/joinそれぞれ独立にrequestIdを持ち、返信のrequestIdが最新のリクエストと一致しない場合
  // (設定を素早く連続変更した場合)は古い結果として無視する
  const workerRef = useRef<Worker | null>(null)
  const fillRequestIdRef = useRef(0)
  const joinRequestIdRef = useRef(0)
  const pendingFillInput = useRef<FillInput | null>(null)
  const pendingJoinInput = useRef<JoinInput | null>(null)

  useEffect(() => {
    const worker = new Worker(
      new URL('../core/worker/processing.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker
    const handleProgress = (
      message: Extract<ProcessingResponse, { type: 'progress' }>,
    ): void => {
      if (message.phase === 'fill') {
        if (message.requestId !== fillRequestIdRef.current) return
        setFillPercent(message.percent)
        return
      }
      if (message.requestId !== joinRequestIdRef.current) return
      setJoinPercent(message.percent)
    }
    const handleFillDone = (
      message: Extract<ProcessingResponse, { type: 'fill-done' }>,
    ): void => {
      if (message.requestId !== fillRequestIdRef.current) return
      const input = pendingFillInput.current
      if (input === null) return
      setFillProcessed({
        input,
        value: message.fillBlocks,
      })
    }
    const handleJoinDone = (
      message: Extract<ProcessingResponse, { type: 'join-done' }>,
    ): void => {
      if (message.requestId !== joinRequestIdRef.current) return
      const input = pendingJoinInput.current
      if (input === null) return
      setJoinProcessed({ input, value: message.blocks })
    }
    worker.onmessage = (event: MessageEvent<ProcessingResponse>) => {
      const message = event.data
      switch (message.type) {
        case 'progress':
          handleProgress(message)
          return
        case 'fill-done':
          handleFillDone(message)
          return
        case 'join-done':
          handleJoinDone(message)
          return
      }
    }
    return () => worker.terminate()
  }, [])

  useEffect(() => {
    pendingFillInput.current = fillInput
    if (!fillInput) return
    const worker = workerRef.current
    if (!worker) return
    const requestId = ++fillRequestIdRef.current
    setFillPercent(0)
    worker.postMessage({ ...fillInput, requestId })
  }, [fillInput])

  useEffect(() => {
    pendingJoinInput.current = joinInput
    if (!joinInput) return
    const worker = workerRef.current
    if (!worker) return
    const requestId = ++joinRequestIdRef.current
    setJoinPercent(0)
    worker.postMessage({ ...joinInput, requestId })
  }, [joinInput])

  const isFillProcessing =
    fillInput !== null && fillProcessed?.input !== fillInput
  const isJoinProcessing =
    joinInput !== null && joinProcessed?.input !== joinInput

  const fillBlocks =
    fillProcessed?.input === fillInput ? fillProcessed.value : EMPTY_FILL_BLOCKS

  const separateBlocks = useMemo(
    () => unjoinedBlocks(parseResult?.strokes ?? []),
    [parseResult],
  )
  const blocks =
    joinProcessed?.input === joinInput ? joinProcessed.value : separateBlocks

  return {
    fillBlocks,
    blocks,
    joinActivated: joinInput !== null,
    isProcessing: isFillProcessing || isJoinProcessing,
    phase: isFillProcessing ? 'fill' : isJoinProcessing ? 'join' : null,
    percent: isFillProcessing
      ? fillPercent
      : isJoinProcessing
        ? joinPercent
        : 0,
  }
}
