import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FillBlock, FillSettings } from '../core/fill/types'
import { buildJoinedBlocks } from '../core/plan/strokeJoin'
import type { JoinedBlock } from '../core/plan/types'
import type { SvgParseResult } from '../core/svg/types'
import type {
  ProcessingPhase,
  ProcessingRequest,
  ProcessingResponse,
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

/** 「どのparseResultに対して計算した結果か」を添えて保持する(ファイル切替直後の不整合を防ぐ) */
interface ProcessedFor<T> {
  parseResult: SvgParseResult
  value: T
}

interface UseProcessingArgs {
  parseResult: SvgParseResult | null
  fillSettings: FillSettings
  fillOverrides: Map<string, Partial<FillSettings>>
  joinDistanceMm: number
  joinOverrides: Map<string, boolean>
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
  /** 「パス結合」ボタン: 現在のparseResultに対して結合処理を有効化する */
  activateJoin: () => void
  resetJoin: () => void
}

/**
 * 塗りブロック生成(buildFillBlocks)・端点結合(buildJoinedBlocks、FR-14)はいずれも重い処理のため、
 * メインスレッドをブロックしないようWeb Workerにオフロードする。結果は「どのparseResultに対する
 * 計算か」とセットで保持し、現在のparseResultと一致する場合のみ有効な結果として扱う。
 *
 * fillとjoinは互いに独立したリクエスト系統として扱う: fillは設定変更に追従して自動実行される一方、
 * joinはファイル読込直後に自動実行せず「パス結合」ボタン押下時のみ実行する(読込直後にパス結合・
 * 書き順最適化が勝手に走らないようにする、という要件のため)。
 */
export function useProcessing({
  parseResult,
  fillSettings,
  fillOverrides,
  joinDistanceMm,
  joinOverrides,
}: UseProcessingArgs): ProcessingState {
  const [fillProcessed, setFillProcessed] = useState<ProcessedFor<
    FillBlock[]
  > | null>(null)
  const [joinProcessed, setJoinProcessed] = useState<ProcessedFor<
    JoinedBlock[]
  > | null>(null)
  const [fillPercent, setFillPercent] = useState(0)
  const [joinPercent, setJoinPercent] = useState(0)

  /**
   * joinActivatedForは「パス結合」ボタン押下時点のparseResultへの参照。現在のparseResultと
   * 一致する間だけ結合処理が有効(=joinActivated)とみなす。ファイル再読込・パース設定変更で
   * parseResultの参照が変わると自動的にfalseへ戻るため、専用のリセットeffectが不要
   * (effect経由のリセットだと、同一コミット内で他のeffectが更新前の値を読んでしまう
   * タイミング問題が起きうる)
   */
  const [joinActivatedFor, setJoinActivatedFor] =
    useState<SvgParseResult | null>(null)
  const joinActivated =
    joinActivatedFor !== null && joinActivatedFor === parseResult

  // fill/joinそれぞれ独立にrequestIdを持ち、返信のrequestIdが最新のリクエストと一致しない場合
  // (設定を素早く連続変更した場合)は古い結果として無視する
  const workerRef = useRef<Worker | null>(null)
  const fillRequestIdRef = useRef(0)
  const joinRequestIdRef = useRef(0)
  const pendingFillParseResultRef = useRef<SvgParseResult | null>(null)
  const pendingJoinParseResultRef = useRef<SvgParseResult | null>(null)

  useEffect(() => {
    const worker = new Worker(
      new URL('../core/worker/processing.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<ProcessingResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        if (message.phase === 'fill') {
          if (message.requestId !== fillRequestIdRef.current) return
          setFillPercent(message.percent)
        } else {
          if (message.requestId !== joinRequestIdRef.current) return
          setJoinPercent(message.percent)
        }
        return
      }
      if (message.type === 'fill-done') {
        if (message.requestId !== fillRequestIdRef.current) return
        const forParseResult = pendingFillParseResultRef.current
        if (forParseResult === null) return
        setFillProcessed({
          parseResult: forParseResult,
          value: message.fillBlocks,
        })
        return
      }
      if (message.requestId !== joinRequestIdRef.current) return
      const forParseResult = pendingJoinParseResultRef.current
      if (forParseResult === null) return
      setJoinProcessed({ parseResult: forParseResult, value: message.blocks })
    }
    return () => worker.terminate()
  }, [])

  useEffect(() => {
    if (parseResult === null) {
      setFillProcessed(null)
      return
    }
    const worker = workerRef.current
    if (!worker) return
    const requestId = ++fillRequestIdRef.current
    pendingFillParseResultRef.current = parseResult
    setFillPercent(0)
    const request: ProcessingRequest = {
      kind: 'fill',
      requestId,
      fillCandidates: parseResult.fillCandidates,
      fillSettings,
      fillOverrides,
    }
    worker.postMessage(request)
  }, [parseResult, fillSettings, fillOverrides])

  useEffect(() => {
    if (!joinActivated || parseResult === null) return
    const worker = workerRef.current
    if (!worker) return
    const requestId = ++joinRequestIdRef.current
    pendingJoinParseResultRef.current = parseResult
    setJoinPercent(0)
    const request: ProcessingRequest = {
      kind: 'join',
      requestId,
      strokes: parseResult.strokes,
      joinDistanceMm,
      joinOverrides,
    }
    worker.postMessage(request)
  }, [joinActivated, parseResult, joinDistanceMm, joinOverrides])

  const isFillProcessing =
    parseResult !== null && fillProcessed?.parseResult !== parseResult
  const isJoinProcessing =
    joinActivated &&
    parseResult !== null &&
    joinProcessed?.parseResult !== parseResult

  const fillBlocks =
    fillProcessed?.parseResult === parseResult && fillProcessed !== null
      ? fillProcessed.value
      : EMPTY_FILL_BLOCKS

  // パス結合が未実行の間は、各ストロークを個別ブロックとして扱う(距離0・上書きなしでの
  // buildJoinedBlocksはO(n)の単純な変換のためメインスレッドで同期的に計算できる)
  const unjoinedBlocks = useMemo(
    () =>
      buildJoinedBlocks(parseResult?.strokes ?? [], 0, EMPTY_JOIN_OVERRIDES),
    [parseResult],
  )
  const blocks =
    joinActivated && joinProcessed?.parseResult === parseResult
      ? joinProcessed.value
      : unjoinedBlocks

  const activateJoin = useCallback((): void => {
    setJoinActivatedFor(parseResult)
  }, [parseResult])
  const resetJoin = useCallback((): void => {
    setJoinActivatedFor(null)
  }, [])

  return {
    fillBlocks,
    blocks,
    joinActivated,
    isProcessing: isFillProcessing || isJoinProcessing,
    phase: isFillProcessing ? 'fill' : isJoinProcessing ? 'join' : null,
    percent: isFillProcessing
      ? fillPercent
      : isJoinProcessing
        ? joinPercent
        : 0,
    activateJoin,
    resetJoin,
  }
}
