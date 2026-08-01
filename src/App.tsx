import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import { SettingsPanel } from './components/SettingsPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { StrokeListPanel } from './components/StrokeListPanel'
import { ErrorBanner } from './components/ErrorBanner'
import { BoundsWarningBanner } from './components/BoundsWarningBanner'
import { FillErrorBanner } from './components/FillErrorBanner'
import { InvalidInputBanner } from './components/InvalidInputBanner'
import { ProcessingOverlay } from './components/ProcessingOverlay'
import { checkStrokeBounds } from './core/boundsCheck'
import { generateGcode } from './core/gcodeGenerate'
import { parseSvgFile } from './core/svgParser'
import {
  type DrawUnit,
  materializeDrawUnit,
  travelEndpoints,
} from './core/drawUnit'
import {
  buildJoinedBlocks,
  greedyOptimizeOrder,
  joinOverrideKey,
} from './core/pathOptimize'
import { type FillBlock, DEFAULT_FILL_SETTINGS } from './types/fill'
import { describeFillPattern } from './core/fillLabel'
import { DEFAULT_GCODE_SETTINGS } from './types/gcode'
import type {
  HighlightRange,
  HighlightSelection,
  ListEntry,
  ParseSettings,
  PreviewSegment,
  SvgParseResult,
} from './types/svg'
import type { JoinedBlock } from './core/pathOptimize'
import type {
  ProcessingPhase,
  ProcessingRequest,
  ProcessingResponse,
} from './types/processing'

interface FillProcessedResult {
  /** この結果がどのparseResultに対して計算されたものかを示す参照。現在のparseResultと
   * 一致する場合のみ有効な結果として扱う(ファイル切替直後、新しいstrokesに古いfillBlocksが
   * 紐付いてしまう不整合を防ぐ) */
  parseResult: SvgParseResult
  fillBlocks: FillBlock[]
}

interface JoinProcessedResult {
  /** FillProcessedResult.parseResultと同様の紐付け用参照 */
  parseResult: SvgParseResult
  blocks: JoinedBlock[]
}

const EMPTY_FILL_BLOCKS: FillBlock[] = []
// 空Mapの参照を使い回すことで、リセット時にsetJoinOverridesが不要な再postMessageを
// 引き起こさないようにする(ファイル読込ごとにWorkerが2回起動する不具合の解消)
const EMPTY_JOIN_OVERRIDES: Map<string, boolean> = new Map()

const DEFAULT_SETTINGS: ParseSettings = {
  // Illustrator書き出しSVGの標準的な座標系(1 user unit = 1pt = 1/72インチ)に合わせた既定値
  dpi: 72,
  scaleFactor: 1,
  bezierToleranceMm: 0.1,
}

// FR-14: 結合距離の既定値。本来はペン線幅から算出するが、ペン(レイヤー)概念導入(Phase7)前は
// 常にフォールバック値の0.5mmを既定とする
const DEFAULT_JOIN_DISTANCE_MM = 0.5

const PLAY_INTERVAL_MS = 400

/**
 * FR-43: リストの行(ListEntry単位)を、プレビューのセグメント範囲[start, end)に変換する。
 * segmentCountPrefixはListEntryごとのセグメント本数の累積和。リスト再構築の直後に
 * 古い選択が残っていても範囲外参照にならないよう、範囲外はnull(ハイライトなし)として扱う
 */
function toHighlightRange(
  selection: HighlightSelection | null,
  segmentCountPrefix: number[],
): HighlightRange | null {
  if (selection === null) return null
  const endEntry = selection.entryIndex + selection.entryCount
  if (selection.entryIndex < 0 || endEntry >= segmentCountPrefix.length) {
    return null
  }
  const base = segmentCountPrefix[selection.entryIndex]
  if (selection.segmentOffset === undefined) {
    return { start: base, end: segmentCountPrefix[endEntry] }
  }
  // 塗りブロック内の1本(輪郭線・ハッチ線)を指す場合
  const start = base + selection.segmentOffset
  if (start >= segmentCountPrefix[endEntry]) return null
  return { start, end: start + 1 }
}

function App() {
  const [svgText, setSvgText] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [loadId, setLoadId] = useState(0)
  const [settings, setSettings] = useState<ParseSettings>(DEFAULT_SETTINGS)
  const [gcodeSettings, setGcodeSettings] = useState(DEFAULT_GCODE_SETTINGS)
  // 数値入力欄で不正な値が確定されたまま残っている項目のラベル一覧(設定列本体/G-code設定でそれぞれ集計)
  const [settingsInvalidLabels, setSettingsInvalidLabels] = useState<string[]>(
    [],
  )
  const [gcodeInvalidLabels, setGcodeInvalidLabels] = useState<string[]>([])
  const [fillInvalidLabels, setFillInvalidLabels] = useState<string[]>([])
  const invalidFieldLabels = useMemo(
    () => [
      ...settingsInvalidLabels,
      ...gcodeInvalidLabels,
      ...fillInvalidLabels,
    ],
    [settingsInvalidLabels, gcodeInvalidLabels, fillInvalidLabels],
  )

  // SVGパースはDOMParserに依存し、Workerのグローバルスコープでは利用できない(実機検証で確認済み)
  // ため、メインスレッドの同期処理のままとする
  const parseResult = useMemo(() => {
    if (svgText === null) return null
    return parseSvgFile(svgText, settings)
  }, [svgText, settings])

  const strokes = parseResult?.strokes ?? []
  const fillCandidates = parseResult?.fillCandidates ?? []
  const fitKey = svgText === null ? null : String(loadId)

  // FR-17〜21: 塗りつぶし(ハッチング)設定。ペン(レイヤー)概念導入(Phase7)前は、
  // 全ての塗りブロックに共通の設定として全体で共有する(joinDistanceMmと同じ簡略化パターン)
  const [fillSettings, setFillSettings] = useState(DEFAULT_FILL_SETTINGS)
  // リストのfill行に出す方式名。設定変更からWorkerの結果が返るまでの間だけ表記が先行するが、
  // その間は行自体がpending表示になるため実害はない
  const fillPatternLabel = useMemo(
    () => describeFillPattern(fillSettings),
    [fillSettings],
  )

  // FR-14: 端点結合(結合ブロック化)。距離閾値+個別上書きから毎回再計算する
  const [joinDistanceMm, setJoinDistanceMm] = useState(DEFAULT_JOIN_DISTANCE_MM)
  const [joinOverrides, setJoinOverrides] =
    useState<Map<string, boolean>>(EMPTY_JOIN_OVERRIDES)

  // 塗りブロック生成(buildFillBlocks)・端点結合(buildJoinedBlocks、FR-14)はいずれも重い処理のため、
  // メインスレッドをブロックしないようWeb Workerにオフロードする。結果は「どのparseResultに対する
  // 計算か」とセットで保持し、現在のparseResultと一致する場合のみ有効な結果として扱う。
  // fillとjoinは互いに独立したリクエスト系統として扱う: fillは設定変更に追従して自動実行される一方、
  // joinはファイル読込直後に自動実行せず「パス結合」ボタン押下時のみ実行する(読込直後にパス結合・
  // 書き順最適化が勝手に走らないようにする、という要件のため)
  const [fillProcessed, setFillProcessed] =
    useState<FillProcessedResult | null>(null)
  const isFillProcessing =
    parseResult !== null && fillProcessed?.parseResult !== parseResult
  const fillBlocks =
    fillProcessed?.parseResult === parseResult
      ? fillProcessed.fillBlocks
      : EMPTY_FILL_BLOCKS

  // joinActivatedForは「パス結合」ボタン押下時点のparseResultへの参照。現在のparseResultと
  // 一致する間だけ結合処理が有効(=joinActivated)とみなす。ファイル再読込・パース設定変更で
  // parseResultの参照が変わると自動的にfalseへ戻るため、専用のリセットeffectが不要
  // (effect経由のリセットだと、同一コミット内で他のeffectが更新前の値を読んでしまう
  // タイミング問題が起きうる)
  const [joinActivatedFor, setJoinActivatedFor] =
    useState<SvgParseResult | null>(null)
  const joinActivated =
    joinActivatedFor !== null && joinActivatedFor === parseResult
  const [joinProcessed, setJoinProcessed] =
    useState<JoinProcessedResult | null>(null)
  const isJoinProcessing =
    joinActivated &&
    parseResult !== null &&
    joinProcessed?.parseResult !== parseResult
  // パス結合が未実行の間は、各ストロークを個別ブロックとして扱う(距離0・上書きなしでの
  // buildJoinedBlocksはO(n)の単純な変換のためメインスレッドで同期的に計算できる)
  const unjoinedBlocks = useMemo(
    () => buildJoinedBlocks(strokes, 0, EMPTY_JOIN_OVERRIDES),
    [strokes],
  )
  const blocks =
    joinActivated && joinProcessed?.parseResult === parseResult
      ? joinProcessed.blocks
      : unjoinedBlocks

  const isProcessing = isFillProcessing || isJoinProcessing
  const processingPhase: ProcessingPhase | null = isFillProcessing
    ? 'fill'
    : isJoinProcessing
      ? 'join'
      : null
  const [fillProcessingPercent, setFillProcessingPercent] = useState(0)
  const [joinProcessingPercent, setJoinProcessingPercent] = useState(0)
  const processingPercent = isFillProcessing
    ? fillProcessingPercent
    : isJoinProcessing
      ? joinProcessingPercent
      : 0

  // fill/joinそれぞれ独立にrequestIdを持ち、返信のrequestIdが最新のリクエストと一致しない場合
  // (設定を素早く連続変更した場合)は古い結果として無視する
  const workerRef = useRef<Worker | null>(null)
  const fillRequestIdRef = useRef(0)
  const joinRequestIdRef = useRef(0)
  const pendingFillParseResultRef = useRef<SvgParseResult | null>(null)
  const pendingJoinParseResultRef = useRef<SvgParseResult | null>(null)

  useEffect(() => {
    const worker = new Worker(
      new URL('./core/processing.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<ProcessingResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        if (message.phase === 'fill') {
          if (message.requestId !== fillRequestIdRef.current) return
          setFillProcessingPercent(message.percent)
        } else {
          if (message.requestId !== joinRequestIdRef.current) return
          setJoinProcessingPercent(message.percent)
        }
        return
      }
      if (message.type === 'fill-done') {
        if (message.requestId !== fillRequestIdRef.current) return
        const forParseResult = pendingFillParseResultRef.current
        if (forParseResult === null) return
        setFillProcessed({
          parseResult: forParseResult,
          fillBlocks: message.fillBlocks,
        })
        return
      }
      if (message.requestId !== joinRequestIdRef.current) return
      const forParseResult = pendingJoinParseResultRef.current
      if (forParseResult === null) return
      setJoinProcessed({ parseResult: forParseResult, blocks: message.blocks })
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
    setFillProcessingPercent(0)
    const request: ProcessingRequest = {
      kind: 'fill',
      requestId,
      fillCandidates,
      fillSettings,
    }
    worker.postMessage(request)
    // fillCandidatesはparseResultからのみ導出される派生値(parseResultがnullでない限り
    // 参照も安定)のため、依存配列はparseResultの変化のみで十分
  }, [parseResult, fillSettings])

  useEffect(() => {
    if (!joinActivated || parseResult === null) return
    const worker = workerRef.current
    if (!worker) return
    const requestId = ++joinRequestIdRef.current
    pendingJoinParseResultRef.current = parseResult
    setJoinProcessingPercent(0)
    const request: ProcessingRequest = {
      kind: 'join',
      requestId,
      strokes,
      joinDistanceMm,
      joinOverrides,
    }
    worker.postMessage(request)
    // strokesはparseResultからのみ導出される派生値のため、依存配列はparseResultの変化のみで十分
  }, [joinActivated, parseResult, joinDistanceMm, joinOverrides])

  const handleJoinPaths = useCallback((): void => {
    setJoinActivatedFor(parseResult)
  }, [parseResult])

  // FR-14の結合ブロックとFR-22の塗りブロックを、書き順並び替え(FR-15)の対象として1列に統合する
  const units: DrawUnit[] = useMemo(
    () => [
      ...blocks.map((block): DrawUnit => ({ kind: 'joinedStroke', block })),
      ...fillBlocks.map((fillBlock): DrawUnit => ({ kind: 'fill', fillBlock })),
    ],
    [blocks, fillBlocks],
  )

  // FR-15: 貪欲法による並び替え結果(「最適化」ボタン押下時のみ設定)。
  // ユニット構成が変わるような幾何変更(ファイル再読込・結合距離変更・塗り設定変更等)が
  // 起きたら破棄する
  const [optimizedOrder, setOptimizedOrder] = useState<{
    order: number[]
    reversed: boolean[]
  } | null>(null)
  useEffect(() => {
    setOptimizedOrder(null)
  }, [units])
  useEffect(() => {
    setJoinOverrides((prev) => (prev.size === 0 ? prev : EMPTY_JOIN_OVERRIDES))
  }, [fitKey])

  // optimizedOrderは非同期(useEffect)でしか破棄されないため、ファイル再読込直後の1レンダリングでは
  // 旧ユニット数基準のインデックスと新しいunitsが同居しうる。長さが一致しない場合はここで無効化し、
  // units[unitIdx]がundefinedになってmaterializeDrawUnitが落ちるのを防ぐ
  const unitOrder = useMemo(
    () =>
      optimizedOrder?.order.length === units.length
        ? optimizedOrder.order
        : units.map((_, i) => i),
    [optimizedOrder, units],
  )
  const unitReversedFlags = useMemo(
    () =>
      optimizedOrder?.reversed.length === units.length
        ? optimizedOrder.reversed
        : units.map(() => false),
    [optimizedOrder, units],
  )
  const materializedUnits = useMemo(
    () =>
      unitOrder.map((unitIdx, i) =>
        materializeDrawUnit(units[unitIdx], strokes, unitReversedFlags[i]),
      ),
    [unitOrder, unitReversedFlags, units, strokes],
  )
  const listEntries: ListEntry[] = useMemo(
    () =>
      materializedUnits.flatMap((m, blockId): ListEntry[] => {
        if (m.kind === 'joinedStroke') {
          return m.strokes!.map((s) => ({ kind: 'stroke', blockId, ...s }))
        }
        const fb = m.fillBlock!
        return [
          {
            kind: 'fill',
            blockId,
            id: fb.id,
            sourceId: fb.sourceId,
            color: fb.color,
            patternLabel: fillPatternLabel,
            fillChainCount: fb.fillChains.length,
            outlineLoopCount: fb.outlineLoops?.length ?? 0,
            error: fb.error,
          },
        ]
      }),
    [materializedUnits, fillPatternLabel],
  )
  // segmentCountPerEntry[i]は、listEntries[i]がpreviewSegmentsにいくつの物理セグメントを
  // 寄与するか(strokeは常に1、fillはgcodeSegments本数)。FR-23のステップ(ListEntry単位)を
  // プレビューのセグメント単位に変換するために使う
  const segmentCountPerEntry = useMemo(
    () =>
      materializedUnits.flatMap((m) =>
        m.kind === 'joinedStroke'
          ? m.strokes!.map(() => 1)
          : [m.gcodeSegments.length],
      ),
    [materializedUnits],
  )
  const previewSegments: PreviewSegment[] = useMemo(
    () =>
      materializedUnits.flatMap((m, blockId): PreviewSegment[] => {
        if (m.kind === 'joinedStroke') {
          return m.strokes!.map((s, idx) => ({
            blockId,
            points: s.points,
            color: s.color,
            penLiftBefore: idx === 0,
          }))
        }
        return m.gcodeSegments.map((points) => ({
          blockId,
          points,
          color: m.color,
          penLiftBefore: true,
        }))
      }),
    [materializedUnits],
  )
  // プレビューのタイトル欄に出す本数の内訳。strokeCountは全ストローク総数(通常ストローク+
  // 塗りブロック内の線)で、括弧内にその内数として塗りブロック数・塗りブロック内の線数を示す
  const previewCounts = useMemo(() => {
    let plainStrokeCount = 0
    let fillCount = 0
    let fillStrokeCount = 0
    for (const m of materializedUnits) {
      if (m.kind === 'joinedStroke') {
        plainStrokeCount += m.strokes!.length
      } else {
        fillCount++
        fillStrokeCount += m.gcodeSegments.length
      }
    }
    return {
      strokeCount: plainStrokeCount + fillStrokeCount,
      fillCount,
      fillStrokeCount,
    }
  }, [materializedUnits])

  const drawGroups = useMemo(
    () =>
      materializedUnits.flatMap((m) =>
        m.gcodeSegments.map((points) => ({ points })),
      ),
    [materializedUnits],
  )

  const handleOptimize = useCallback((): void => {
    const endpoints = units
      .map((u) => materializeDrawUnit(u, strokes, false))
      .map(travelEndpoints)
    setOptimizedOrder(greedyOptimizeOrder(endpoints, { x: 0, y: 0 }))
  }, [units, strokes])
  const handleResetAll = useCallback((): void => {
    setOptimizedOrder(null)
    setJoinOverrides(EMPTY_JOIN_OVERRIDES)
    setJoinActivatedFor(null)
  }, [])
  const handleSetJoinOverride = useCallback(
    (idA: string, idB: string, join: boolean): void => {
      setJoinOverrides((prev) => {
        const next = new Map(prev)
        next.set(joinOverrideKey(idA, idB), join)
        return next
      })
    },
    [],
  )

  // FR-38/NFR-3: 描画可能領域からのはみ出し検出。解消するまでG-codeのダウンロードをブロックする
  const boundsWarnings = useMemo(
    () =>
      checkStrokeBounds(strokes, {
        widthMm: gcodeSettings.bedWidthMm,
        heightMm: gcodeSettings.bedHeightMm,
      }),
    [strokes, gcodeSettings.bedWidthMm, gcodeSettings.bedHeightMm],
  )
  const canDownloadGcode =
    (strokes.length > 0 || fillBlocks.length > 0) &&
    boundsWarnings.length === 0 &&
    invalidFieldLabels.length === 0

  const handleDownloadGcode = (): void => {
    if (!canDownloadGcode) return
    const gcode = generateGcode(drawGroups, gcodeSettings)
    const blob = new Blob([gcode], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(fileName ?? 'output').replace(/\.svg$/i, '')}.gcode`
    a.click()
    URL.revokeObjectURL(url)
  }

  // FR-23: ステップ実行プレビュー。ListEntry単位(塗りブロックは1ブロック=1ステップ)で数える。
  // 読込み直後は最終ステップ(全リスト項目描画済み)を初期表示とする
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  // ファイル再読込時、blocks/fillBlocksはWorkerの返信を待って非同期に確定する(listEntriesも
  // それに伴い遅れて更新される)。そのためfitKey変化時点では即座に全展開できず、Worker処理が
  // 完了しlistEntriesが新ファイルの内容で確定してから全展開する必要がある
  const pendingFullRevealRef = useRef(false)

  useEffect(() => {
    pendingFullRevealRef.current = true
    setPlaying(false)
  }, [fitKey])

  useEffect(() => {
    if (isProcessing) return
    if (pendingFullRevealRef.current) {
      pendingFullRevealRef.current = false
      setStep(listEntries.length)
      return
    }
    setStep((s) => Math.min(s, listEntries.length))
  }, [isProcessing, listEntries])

  useEffect(() => {
    if (!playing) return
    if (step >= listEntries.length) {
      setPlaying(false)
      return
    }
    const timer = setInterval(() => {
      setStep((s) => {
        if (s + 1 >= listEntries.length) {
          setPlaying(false)
          return listEntries.length
        }
        return s + 1
      })
    }, PLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [playing, step, listEntries.length])

  // segmentCountPerEntryの累積和。stepごとの再計算をO(N)のslice+reduceからO(1)の配列参照にする
  const segmentCountPrefix = useMemo(() => {
    const prefix = new Array<number>(segmentCountPerEntry.length + 1)
    prefix[0] = 0
    for (let i = 0; i < segmentCountPerEntry.length; i++) {
      prefix[i + 1] = prefix[i] + segmentCountPerEntry[i]
    }
    return prefix
  }, [segmentCountPerEntry])
  const visibleSegmentCount =
    segmentCountPrefix[Math.min(step, segmentCountPrefix.length - 1)] ?? 0

  // FR-43: ストローク並び順リストのホバー/選択と、プレビューのハイライト表示を同期する。
  // リスト構成が変わった時点で対応が取れなくなるため、両方とも解除する
  const [hoveredSelection, setHoveredSelection] =
    useState<HighlightSelection | null>(null)
  const [selectedSelection, setSelectedSelection] =
    useState<HighlightSelection | null>(null)
  useEffect(() => {
    setHoveredSelection(null)
    setSelectedSelection(null)
  }, [listEntries])
  // ホバーはmousemove相当の頻度で通知されるため、同じ行のままなら前の状態をそのまま返して
  // 再レンダ自体を起こさない。選択は同じ行の再クリックで解除する
  const handleHover = useCallback((next: HighlightSelection | null): void => {
    setHoveredSelection((prev) =>
      (prev?.key ?? null) === (next?.key ?? null) ? prev : next,
    )
  }, [])
  const handleSelect = useCallback((next: HighlightSelection): void => {
    setSelectedSelection((prev) => (prev?.key === next.key ? null : next))
  }, [])
  const hoverHighlight = useMemo(
    () => toHighlightRange(hoveredSelection, segmentCountPrefix),
    [hoveredSelection, segmentCountPrefix],
  )
  const selectedHighlight = useMemo(
    () => toHighlightRange(selectedSelection, segmentCountPrefix),
    [selectedSelection, segmentCountPrefix],
  )

  const fillErrors = useMemo(
    () => fillBlocks.flatMap((fb) => (fb.error ? [fb.error] : [])),
    [fillBlocks],
  )

  const handleStepChange = useCallback((next: number): void => {
    setPlaying(false)
    setStep(next)
  }, [])
  const handleTogglePlaying = useCallback((): void => {
    setPlaying((p) => !p)
  }, [])
  // ストローク並び順リストの再構築(数万行になりうる)は低優先度の更新として扱い、
  // プレビューCanvas側の即時反映をブロックしないようにする
  const deferredStep = useDeferredValue(step)

  return (
    <div className="app-shell">
      <ProcessingOverlay
        isProcessing={isProcessing}
        phase={processingPhase}
        percent={processingPercent}
      />
      <ErrorBanner errors={parseResult?.errors ?? []} />
      <BoundsWarningBanner warnings={boundsWarnings} />
      <FillErrorBanner errors={fillErrors} />
      <InvalidInputBanner labels={invalidFieldLabels} />
      <div className="app-layout">
        <SettingsPanel
          settings={settings}
          onFileSelected={(text, name) => {
            setSvgText(text)
            setFileName(name)
            setLoadId((id) => id + 1)
          }}
          onSettingsChange={setSettings}
          onSettingsInvalidChange={setSettingsInvalidLabels}
          gcodeSettings={gcodeSettings}
          onGcodeSettingsChange={setGcodeSettings}
          onGcodeInvalidChange={setGcodeInvalidLabels}
          joinDistanceMm={joinDistanceMm}
          onJoinDistanceChange={setJoinDistanceMm}
          onJoinPaths={handleJoinPaths}
          onOptimize={handleOptimize}
          onResetAll={handleResetAll}
          hasEntries={listEntries.length > 0}
          fillSettings={fillSettings}
          onFillSettingsChange={setFillSettings}
          onFillInvalidChange={setFillInvalidLabels}
          canDownloadGcode={canDownloadGcode}
          boundsWarningCount={boundsWarnings.length}
          onDownloadGcode={handleDownloadGcode}
        />
        <PreviewPanel
          fileName={fileName}
          segments={previewSegments}
          strokeCount={previewCounts.strokeCount}
          fillCount={previewCounts.fillCount}
          fillStrokeCount={previewCounts.fillStrokeCount}
          joinApplied={joinActivated}
          optimizeApplied={optimizedOrder !== null}
          visibleSegmentCount={visibleSegmentCount}
          hoverHighlight={hoverHighlight}
          selectedHighlight={selectedHighlight}
          bedWidthMm={gcodeSettings.bedWidthMm}
          bedHeightMm={gcodeSettings.bedHeightMm}
          step={step}
          totalSteps={listEntries.length}
          playing={playing}
          onStep={handleStepChange}
          onTogglePlaying={handleTogglePlaying}
        />
        <StrokeListPanel
          entries={listEntries}
          step={deferredStep}
          joinOverrides={joinOverrides}
          onSetJoinOverride={handleSetJoinOverride}
          selectedKey={selectedSelection?.key ?? null}
          onHover={handleHover}
          onSelect={handleSelect}
        />
      </div>
    </div>
  )
}

export default App
