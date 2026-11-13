import { useCallback, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  downloadTextFile,
  gcodeFileNameFor,
  uploadGcodeToMoonraker,
} from './app/downloadFile'
import {
  getDefaultSettingsPresetName,
  loadDefaultSettingsPreset,
} from './app/settingsStorage'
import type { SettingsBundle } from './app/settingsStorage'
import { useHighlightSelection } from './app/useHighlightSelection'
import {
  EMPTY_FILL_OVERRIDES,
  EMPTY_JOIN_OVERRIDES,
  useProcessing,
} from './app/useProcessing'
import { BoundsWarningBanner } from './components/banners/BoundsWarningBanner'
import { FillErrorBanner } from './components/banners/FillErrorBanner'
import { InvalidInputBanner } from './components/banners/InvalidInputBanner'
import { ParseErrorBanner } from './components/banners/ParseErrorBanner'
import { ProcessingOverlay } from './components/common/ProcessingOverlay'
import { PreviewPanel } from './components/preview/PreviewPanel'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { StrokeListPanel } from './components/strokeList/StrokeListPanel'
import { describeFillPattern } from './core/fill/label'
import { resolveEffectiveFillSettings } from './core/fill/overrides'
import type { FillSettings } from './core/fill/types'
import {
  checkFillCandidateBounds,
  checkStrokeBounds,
} from './core/gcode/boundsCheck'
import { generateGcode } from './core/gcode/generate'
import { buildDrawPlan } from './core/plan/drawPlan'
import { toDrawUnits } from './core/plan/drawUnit'
import { configuredDrawOrder } from './core/plan/optimizeOrder'
import { joinOverrideKey } from './core/plan/strokeJoin'
import {
  createDefaultSettings,
  DEFAULT_PATH_OPTIONS,
  MIN_FILL_SPACING_MM,
  type PathOptions,
} from './core/settingsFile'
import { parseSvgFile } from './core/svg/parseSvgFile'
import { filterJoinedBlocksByMinimumLength } from './core/plan/strokeLength'

function useSettingsState() {
  const [initial] = useState(() => {
    const preset = loadDefaultSettingsPreset()
    return {
      bundle: preset ?? createDefaultSettings(),
      name: preset ? getDefaultSettingsPresetName() : null,
    }
  })
  const [settings, setSettings] = useState(initial.bundle.parseSettings)
  const [gcodeSettings, setGcodeSettings] = useState(
    initial.bundle.gcodeSettings,
  )
  const [fillSettings, setFillSettings] = useState(initial.bundle.fillSettings)
  const [fillOverrides, setFillOverrides] =
    useState<Map<string, Partial<FillSettings>>>(EMPTY_FILL_OVERRIDES)
  const [joinDistanceMm, setJoinDistanceMm] = useState(
    initial.bundle.joinDistanceMm,
  )
  const [joinOverrides, setJoinOverrides] =
    useState<Map<string, boolean>>(EMPTY_JOIN_OVERRIDES)
  const [penWidthMm, setPenWidthMm] = useState(initial.bundle.penWidthMm)
  const [minStrokeLengthMm, setMinStrokeLengthMm] = useState(
    initial.bundle.minStrokeLengthMm,
  )
  const [configuredPathOptions, setConfiguredPathOptions] = useState(
    initial.bundle.pathOptions,
  )
  const [currentSettingsName, setCurrentSettingsName] = useState(initial.name)

  const settingsBundle = useMemo<SettingsBundle>(
    () => ({
      parseSettings: settings,
      gcodeSettings,
      fillSettings,
      joinDistanceMm,
      penWidthMm,
      minStrokeLengthMm,
      pathOptions: configuredPathOptions,
    }),
    [
      settings,
      gcodeSettings,
      fillSettings,
      joinDistanceMm,
      penWidthMm,
      minStrokeLengthMm,
      configuredPathOptions,
    ],
  )
  const handleLoadSettingsBundle = useCallback(
    (bundle: SettingsBundle, name: string): void => {
      setSettings(bundle.parseSettings)
      setGcodeSettings(bundle.gcodeSettings)
      setFillSettings(bundle.fillSettings)
      setJoinDistanceMm(bundle.joinDistanceMm)
      setPenWidthMm(bundle.penWidthMm)
      setMinStrokeLengthMm(bundle.minStrokeLengthMm)
      setConfiguredPathOptions(bundle.pathOptions)
      setCurrentSettingsName(name)
    },
    [],
  )
  const handlePenWidthChange = useCallback((next: number): void => {
    setPenWidthMm(next)
    if (next > 0) {
      setJoinDistanceMm(next)
      setFillSettings((prev) => ({
        ...prev,
        spacingMm: Math.max(
          MIN_FILL_SPACING_MM,
          next * (1 - prev.overlapPercent / 100),
        ),
        fillOffsetMm: next / 2,
      }))
    }
  }, [])

  return {
    settings,
    setSettings,
    gcodeSettings,
    setGcodeSettings,
    fillSettings,
    setFillSettings,
    fillOverrides,
    setFillOverrides,
    joinDistanceMm,
    setJoinDistanceMm,
    joinOverrides,
    setJoinOverrides,
    penWidthMm,
    minStrokeLengthMm,
    setMinStrokeLengthMm,
    currentSettingsName,
    setCurrentSettingsName,
    settingsBundle,
    handleLoadSettingsBundle,
    handlePenWidthChange,
    configuredPathOptions,
    setConfiguredPathOptions,
  }
}

function useSvgFileDrop(
  handleFileSelected: (text: string, name: string) => void,
) {
  // 子要素をまたぐdragenter/dragleaveの出入りでオーバーレイがちらつかないよう、
  // ネスト深さをカウンタで数える
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const dragCounterRef = useRef(0)
  const isSvgFile = (file: File): boolean =>
    file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      dragCounterRef.current += 1
      setIsDraggingFile(true)
    },
    [],
  )
  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
    },
    [],
  )
  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
      if (dragCounterRef.current === 0) setIsDraggingFile(false)
    },
    [],
  )
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      e.preventDefault()
      dragCounterRef.current = 0
      setIsDraggingFile(false)
      const file = e.dataTransfer.files[0]
      if (!file || !isSvgFile(file)) return
      file.text().then((text) => handleFileSelected(text, file.name))
    },
    [handleFileSelected],
  )

  return {
    isDraggingFile,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}

function App() {
  const isPiBuild = import.meta.env.MODE === 'pi'
  const [isUploadingGcode, setIsUploadingGcode] = useState(false)
  const uploadInProgressRef = useRef(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [svgText, setSvgText] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const {
    settings,
    setSettings,
    gcodeSettings,
    setGcodeSettings,
    fillSettings,
    setFillSettings,
    fillOverrides,
    setFillOverrides,
    joinDistanceMm,
    setJoinDistanceMm,
    joinOverrides,
    setJoinOverrides,
    penWidthMm,
    minStrokeLengthMm,
    setMinStrokeLengthMm,
    currentSettingsName,
    setCurrentSettingsName,
    settingsBundle,
    handleLoadSettingsBundle,
    handlePenWidthChange,
    configuredPathOptions,
    setConfiguredPathOptions,
  } = useSettingsState()

  // 数値入力欄で不正な値が確定されたまま残っている項目のラベル一覧(パネルごとに集計)
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

  const parseResult = useMemo(() => {
    if (svgText === null) return null
    return parseSvgFile(svgText, settings)
  }, [svgText, settings])
  // 閾値判定より先に結合できるよう、全ストロークをそのまま処理へ渡す
  const strokes = useMemo(() => parseResult?.strokes ?? [], [parseResult])

  // 操作ボタンでの変更は現在のSVGにだけ適用し、JSONやプリセットの設定は次のSVGにも引き継ぐ。
  const [manualPathOptions, setManualPathOptions] = useState<{
    parseResult: typeof parseResult
    options: PathOptions
  } | null>(null)
  const pathOptions =
    manualPathOptions?.parseResult === parseResult
      ? manualPathOptions.options
      : configuredPathOptions
  const handlePathOptionsChange = (patch: Partial<PathOptions>): void => {
    setConfiguredPathOptions({ ...pathOptions, ...patch })
    setManualPathOptions(null)
  }

  const processing = useProcessing({
    parseResult,
    fillSettings,
    fillOverrides,
    joinDistanceMm,
    joinOverrides,
    joinActivated: pathOptions.optimizePaths && pathOptions.joinPaths,
    allowReverse: pathOptions.reversePaths,
  })

  // 結合前は各ストロークを個別ブロックとして判定し、結合後は接続距離を含む
  // 結合ブロック全体の経路長で判定する。塗りブロックは別系統のため影響しない。
  const visibleBlocks = useMemo(
    () =>
      filterJoinedBlocksByMinimumLength(
        processing.blocks,
        strokes,
        minStrokeLengthMm,
      ),
    [processing.blocks, strokes, minStrokeLengthMm],
  )

  const units = useMemo(
    () => toDrawUnits(visibleBlocks, processing.fillBlocks),
    [visibleBlocks, processing.fillBlocks],
  )

  const optimizedOrder = useMemo(
    () => configuredDrawOrder(units, strokes, pathOptions),
    [units, strokes, pathOptions],
  )

  // リストのfill行に出す方式名(fillId→ラベル)。個別上書きで方式が変わる場合があるため
  // fillごとの実効設定から計算する。設定変更からWorkerの結果が返るまでの間だけ表記が先行するが、
  // その間は行自体がpending表示になるため実害はない
  const fillPatternLabels = useMemo(() => {
    const candidates = parseResult?.fillCandidates ?? []
    return new Map(
      candidates.map((candidate) => [
        candidate.id,
        describeFillPattern(
          resolveEffectiveFillSettings(
            fillSettings,
            fillOverrides.get(candidate.id),
          ),
        ),
      ]),
    )
  }, [parseResult, fillSettings, fillOverrides])
  const overriddenFillIds = useMemo(
    () => new Set(fillOverrides.keys()),
    [fillOverrides],
  )
  const plan = useMemo(
    () =>
      buildDrawPlan(
        units,
        strokes,
        optimizedOrder,
        fillPatternLabels,
        overriddenFillIds,
      ),
    [units, strokes, optimizedOrder, fillPatternLabels, overriddenFillIds],
  )

  const highlight = useHighlightSelection(
    plan.listEntries,
    plan.segmentCountPrefix,
  )

  const applyManualPathOptions = (patch: Partial<PathOptions>): void => {
    setManualPathOptions({
      parseResult,
      options: { ...pathOptions, optimizePaths: true, ...patch },
    })
  }
  const clearOverrides = useCallback((): void => {
    setManualPathOptions(null)
    setJoinOverrides(EMPTY_JOIN_OVERRIDES)
    setFillOverrides(EMPTY_FILL_OVERRIDES)
  }, [setJoinOverrides, setFillOverrides])
  const handleResetAll = (): void => {
    clearOverrides()
    setConfiguredPathOptions(DEFAULT_PATH_OPTIONS)
  }
  const handleApplySettingsBundle = (
    bundle: SettingsBundle,
    name: string,
  ): void => {
    clearOverrides()
    handleLoadSettingsBundle(bundle, name)
  }
  const handleFileSelected = useCallback(
    (text: string, name: string): void => {
      setSvgText(text)
      setFileName(name)
      setManualPathOptions(null)
      setJoinOverrides((prev) =>
        prev.size === 0 ? prev : EMPTY_JOIN_OVERRIDES,
      )
      setFillOverrides((prev) =>
        prev.size === 0 ? prev : EMPTY_FILL_OVERRIDES,
      )
    },
    [setJoinOverrides, setFillOverrides],
  )
  const {
    isDraggingFile,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useSvgFileDrop(handleFileSelected)
  const handleMinStrokeLengthChange = useCallback(
    (next: number): void => {
      if (next === minStrokeLengthMm) return
      setMinStrokeLengthMm(next)
      setManualPathOptions((prev) =>
        prev
          ? { ...prev, options: { ...prev.options, optimizeTravel: false } }
          : prev,
      )
    },
    [minStrokeLengthMm, setMinStrokeLengthMm],
  )
  const handleSetJoinOverride = useCallback(
    (idA: string, idB: string, join: boolean): void => {
      setJoinOverrides((prev) => {
        const next = new Map(prev)
        next.set(joinOverrideKey(idA, idB), join)
        return next
      })
    },
    [setJoinOverrides],
  )
  const handlePatchFillOverride = useCallback(
    (fillId: string, patch: Partial<FillSettings>): void => {
      setFillOverrides((prev) => {
        const next = new Map(prev)
        next.set(fillId, { ...next.get(fillId), ...patch })
        return next
      })
    },
    [setFillOverrides],
  )
  const handleResetFillOverride = useCallback(
    (fillId: string): void => {
      setFillOverrides((prev) => {
        if (!prev.has(fillId)) return prev
        const next = new Map(prev)
        next.delete(fillId)
        return next
      })
    },
    [setFillOverrides],
  )

  // FR-38/NFR-3: 描画可能領域からのはみ出し検出。解消するまでG-codeのダウンロードをブロックする。
  // strokeを持たずfillのみが可視な要素はstrokesに現れないため、fillCandidatesも別途チェックする
  const boundsWarnings = useMemo(() => {
    const bed = {
      widthMm: gcodeSettings.bedWidthMm,
      heightMm: gcodeSettings.bedHeightMm,
    }
    return [
      ...checkStrokeBounds(strokes, bed),
      ...checkFillCandidateBounds(parseResult?.fillCandidates ?? [], bed),
    ]
  }, [
    strokes,
    parseResult,
    gcodeSettings.bedWidthMm,
    gcodeSettings.bedHeightMm,
  ])
  const canDownloadGcode =
    plan.drawGroups.length > 0 &&
    !processing.isProcessing &&
    !parseResult?.errors.some((error) => error.kind === 'parse-error') &&
    boundsWarnings.length === 0 &&
    invalidFieldLabels.length === 0

  const handleDownloadGcode = (): void => {
    if (!canDownloadGcode) return
    downloadTextFile(
      generateGcode(plan.drawGroups, gcodeSettings),
      gcodeFileNameFor(fileName),
    )
  }
  const handleUploadGcode = async (print = false): Promise<void> => {
    if (!canDownloadGcode || uploadInProgressRef.current) return
    uploadInProgressRef.current = true
    setIsUploadingGcode(true)
    setUploadMessage(null)
    try {
      const saved = await uploadGcodeToMoonraker(
        generateGcode(plan.drawGroups, gcodeSettings),
        gcodeFileNameFor(fileName),
        { print },
      )
      if (!saved.saved) setUploadMessage('保存をキャンセルしました。')
      else if (!print)
        setUploadMessage(
          'Moonrakerのgcodesフォルダに保存しました。印刷は開始していません。',
        )
      else if (saved.printStatus === 'started')
        setUploadMessage('G-codeを保存し、印刷を開始しました。')
      else if (saved.printStatus === 'queued')
        setUploadMessage('G-codeを保存し、印刷キューに追加しました。')
      else if (saved.printStatus === 'not_started')
        setUploadMessage(
          'G-codeは保存されましたが、印刷は開始されませんでした。Moonrakerの状態を確認してください。',
        )
      else
        setUploadMessage(
          'G-codeは保存されましたが、印刷開始状態を確認できませんでした。',
        )
    } catch (error) {
      const detail = error instanceof Error ? error.message : '不明なエラー'
      setUploadMessage(
        `Moonrakerへ保存できませんでした: ${detail}。PiのIPアドレスで開き、MoonrakerのCORS設定を確認してください。`,
      )
    } finally {
      uploadInProgressRef.current = false
      setIsUploadingGcode(false)
    }
  }

  const fillErrors = useMemo(
    () => processing.fillBlocks.flatMap((fb) => (fb.error ? [fb.error] : [])),
    [processing.fillBlocks],
  )

  return (
    <div
      className="app-shell"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFile && (
        <div className="modal-backdrop drop-overlay">
          <p>SVGをドロップして読み込み</p>
        </div>
      )}
      <ProcessingOverlay
        isProcessing={processing.isProcessing}
        phase={processing.phase}
        percent={processing.percent}
      />
      <div className="app-layout">
        <SettingsPanel
          settings={settings}
          onFileSelected={handleFileSelected}
          onSettingsChange={setSettings}
          onSettingsInvalidChange={setSettingsInvalidLabels}
          gcodeSettings={gcodeSettings}
          onGcodeSettingsChange={setGcodeSettings}
          onGcodeInvalidChange={setGcodeInvalidLabels}
          joinDistanceMm={joinDistanceMm}
          onJoinDistanceChange={setJoinDistanceMm}
          penWidthMm={penWidthMm}
          minStrokeLengthMm={minStrokeLengthMm}
          onMinStrokeLengthChange={handleMinStrokeLengthChange}
          onPenWidthChange={handlePenWidthChange}
          onJoinPaths={() =>
            applyManualPathOptions(
              !pathOptions.joinPaths &&
                !pathOptions.reorderPaths &&
                !pathOptions.reversePaths
                ? { joinPaths: true, reversePaths: true, optimizeTravel: false }
                : { joinPaths: true },
            )
          }
          onOptimize={() =>
            applyManualPathOptions({
              optimizeTravel: true,
              reorderPaths: true,
              reversePaths: true,
            })
          }
          onResetAll={handleResetAll}
          hasEntries={plan.listEntries.length > 0}
          fillSettings={fillSettings}
          onFillSettingsChange={(patch) =>
            setFillSettings((prev) => ({ ...prev, ...patch }))
          }
          onFillInvalidChange={setFillInvalidLabels}
          canDownloadGcode={canDownloadGcode}
          boundsWarningCount={boundsWarnings.length}
          onDownloadGcode={handleDownloadGcode}
          isPiBuild={isPiBuild}
          isUploading={isUploadingGcode}
          uploadMessage={uploadMessage}
          onUploadGcode={() => void handleUploadGcode()}
          onPrintGcode={() => void handleUploadGcode(true)}
          settingsBundle={{ ...settingsBundle, pathOptions }}
          onPathOptionsChange={handlePathOptionsChange}
          onLoadSettingsBundle={handleApplySettingsBundle}
          currentSettingsName={currentSettingsName}
          onSettingsNameChange={setCurrentSettingsName}
        />
        <PreviewPanel
          fileName={fileName}
          segments={plan.previewSegments}
          strokeCount={plan.counts.strokeCount}
          fillCount={plan.counts.fillCount}
          fillStrokeCount={plan.counts.fillStrokeCount}
          joinApplied={processing.joinActivated}
          optimizeApplied={optimizedOrder !== null}
          hoverHighlight={highlight.hoverHighlight}
          selectedHighlight={highlight.selectedHighlight}
          onSegmentHover={highlight.onSegmentHover}
          onSegmentSelect={highlight.onSegmentSelect}
          bedWidthMm={gcodeSettings.bedWidthMm}
          bedHeightMm={gcodeSettings.bedHeightMm}
          penWidthMm={penWidthMm}
          errorBanners={
            <>
              <ParseErrorBanner errors={parseResult?.errors ?? []} />
              <BoundsWarningBanner warnings={boundsWarnings} />
              <FillErrorBanner errors={fillErrors} />
              <InvalidInputBanner labels={invalidFieldLabels} />
            </>
          }
        />
        <StrokeListPanel
          entries={plan.listEntries}
          joinOverrides={joinOverrides}
          onSetJoinOverride={handleSetJoinOverride}
          fillSettings={fillSettings}
          fillOverrides={fillOverrides}
          onPatchFillOverride={handlePatchFillOverride}
          onResetFillOverride={handleResetFillOverride}
          selectedKey={highlight.selectedKey}
          previewHoverKey={highlight.hoverKey}
          onHover={highlight.onHover}
          onSelect={highlight.onSelect}
        />
      </div>
    </div>
  )
}

export default App
