import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import './App.css'
import { downloadTextFile, gcodeFileNameFor } from './app/downloadFile'
import { useHighlightSelection } from './app/useHighlightSelection'
import {
  EMPTY_FILL_OVERRIDES,
  EMPTY_JOIN_OVERRIDES,
  useProcessing,
} from './app/useProcessing'
import { useStepPlayback } from './app/useStepPlayback'
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
import { DEFAULT_FILL_SETTINGS, type FillSettings } from './core/fill/types'
import { checkStrokeBounds } from './core/gcode/boundsCheck'
import { generateGcode } from './core/gcode/generate'
import { DEFAULT_GCODE_SETTINGS } from './core/gcode/types'
import { buildDrawPlan } from './core/plan/drawPlan'
import { toDrawUnits } from './core/plan/drawUnit'
import { optimizeDrawOrder } from './core/plan/optimizeOrder'
import {
  DEFAULT_JOIN_DISTANCE_MM,
  joinOverrideKey,
} from './core/plan/strokeJoin'
import type { UnitOrder } from './core/plan/types'
import { parseSvgFile } from './core/svg/parseSvgFile'
import { DEFAULT_PARSE_SETTINGS, type ParseSettings } from './core/svg/types'

function App() {
  const [svgText, setSvgText] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [loadId, setLoadId] = useState(0)
  const [settings, setSettings] = useState<ParseSettings>(
    DEFAULT_PARSE_SETTINGS,
  )
  const [gcodeSettings, setGcodeSettings] = useState(DEFAULT_GCODE_SETTINGS)
  // FR-17〜21: 塗りつぶし設定。ペン(レイヤー)概念導入(Phase7)前は、
  // 全ての塗りブロックに共通の設定として全体で共有する(joinDistanceMmと同じ簡略化パターン)
  const [fillSettings, setFillSettings] = useState(DEFAULT_FILL_SETTINGS)
  // 塗りの個別上書き(fillId→変更されたフィールドのみ)。未上書きのフィールドはfillSettingsへ追従する
  const [fillOverrides, setFillOverrides] =
    useState<Map<string, Partial<FillSettings>>>(EMPTY_FILL_OVERRIDES)
  // FR-14: 端点結合。距離閾値+個別上書きから毎回再計算する
  const [joinDistanceMm, setJoinDistanceMm] = useState(DEFAULT_JOIN_DISTANCE_MM)
  const [joinOverrides, setJoinOverrides] =
    useState<Map<string, boolean>>(EMPTY_JOIN_OVERRIDES)
  // ペン先の太さ(mm)。0=未入力。Phase7(ペン分割)前は全体共有の設定とし、
  // 変更された瞬間だけ結合距離・線間隔・塗りオフセットへ一度反映する(以降は個別に自由編集できる)
  const [penWidthMm, setPenWidthMm] = useState(0)

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

  // SVGパースはDOMParserに依存し、Workerのグローバルスコープでは利用できない(実機検証で確認済み)
  // ため、メインスレッドの同期処理のままとする
  const parseResult = useMemo(() => {
    if (svgText === null) return null
    return parseSvgFile(svgText, settings)
  }, [svgText, settings])
  // parseResultが変わらない限り同じ参照を保ち、下流のuseMemoが無駄に再計算されないようにする
  const strokes = useMemo(() => parseResult?.strokes ?? [], [parseResult])
  const loadKey = svgText === null ? null : String(loadId)

  const processing = useProcessing({
    parseResult,
    fillSettings,
    fillOverrides,
    joinDistanceMm,
    joinOverrides,
  })

  const units = useMemo(
    () => toDrawUnits(processing.blocks, processing.fillBlocks),
    [processing.blocks, processing.fillBlocks],
  )

  // FR-15: 貪欲法による並び替え結果(「最適化」ボタン押下時のみ設定)。
  // ユニット構成が変わるような幾何変更(ファイル再読込・結合距離変更・塗り設定変更等)が
  // 起きたら、buildDrawPlan側で長さの不一致として破棄される
  const [optimizedOrder, setOptimizedOrder] = useState<UnitOrder | null>(null)
  const optimizeApplied =
    optimizedOrder !== null && optimizedOrder.order.length === units.length

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

  const playback = useStepPlayback({
    totalSteps: plan.listEntries.length,
    isProcessing: processing.isProcessing,
    revealKey: loadKey,
  })
  const visibleSegmentCount =
    plan.segmentCountPrefix[
      Math.min(playback.step, plan.segmentCountPrefix.length - 1)
    ] ?? 0
  const highlight = useHighlightSelection(
    plan.listEntries,
    plan.segmentCountPrefix,
  )

  const handleOptimize = useCallback((): void => {
    setOptimizedOrder(optimizeDrawOrder(units, strokes, { x: 0, y: 0 }))
  }, [units, strokes])
  const handleResetAll = useCallback((): void => {
    setOptimizedOrder(null)
    setJoinOverrides(EMPTY_JOIN_OVERRIDES)
    setFillOverrides(EMPTY_FILL_OVERRIDES)
    processing.resetJoin()
  }, [processing])
  const handleFileSelected = useCallback((text: string, name: string): void => {
    setSvgText(text)
    setFileName(name)
    setLoadId((id) => id + 1)
    setOptimizedOrder(null)
    setJoinOverrides((prev) => (prev.size === 0 ? prev : EMPTY_JOIN_OVERRIDES))
    setFillOverrides((prev) => (prev.size === 0 ? prev : EMPTY_FILL_OVERRIDES))
  }, [])
  // ペン先の太さが変更された瞬間だけ、結合距離・線間隔・塗りオフセットへ一度だけ反映する
  // (以降はそれぞれ個別に自由編集でき、太さ側の変更を継続的に追従しない)
  const handlePenWidthChange = useCallback((next: number): void => {
    setPenWidthMm(next)
    if (next > 0) {
      setJoinDistanceMm(next)
      setFillSettings((prev) => ({
        ...prev,
        spacingMm: next * (1 - prev.overlapPercent / 100),
        fillOffsetMm: next / 2,
      }))
    }
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
  const handlePatchFillOverride = useCallback(
    (fillId: string, patch: Partial<FillSettings>): void => {
      setFillOverrides((prev) => {
        const next = new Map(prev)
        next.set(fillId, { ...next.get(fillId), ...patch })
        return next
      })
    },
    [],
  )
  const handleResetFillOverride = useCallback((fillId: string): void => {
    setFillOverrides((prev) => {
      if (!prev.has(fillId)) return prev
      const next = new Map(prev)
      next.delete(fillId)
      return next
    })
  }, [])

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
    plan.drawGroups.length > 0 &&
    boundsWarnings.length === 0 &&
    invalidFieldLabels.length === 0

  const handleDownloadGcode = (): void => {
    if (!canDownloadGcode) return
    downloadTextFile(
      generateGcode(plan.drawGroups, gcodeSettings),
      gcodeFileNameFor(fileName),
    )
  }

  const fillErrors = useMemo(
    () => processing.fillBlocks.flatMap((fb) => (fb.error ? [fb.error] : [])),
    [processing.fillBlocks],
  )

  // ストローク並び順リストの再構築(数万行になりうる)は低優先度の更新として扱い、
  // プレビューCanvas側の即時反映をブロックしないようにする
  const deferredStep = useDeferredValue(playback.step)

  return (
    <div className="app-shell">
      <ProcessingOverlay
        isProcessing={processing.isProcessing}
        phase={processing.phase}
        percent={processing.percent}
      />
      <ParseErrorBanner errors={parseResult?.errors ?? []} />
      <BoundsWarningBanner warnings={boundsWarnings} />
      <FillErrorBanner errors={fillErrors} />
      <InvalidInputBanner labels={invalidFieldLabels} />
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
          onPenWidthChange={handlePenWidthChange}
          onJoinPaths={processing.activateJoin}
          onOptimize={handleOptimize}
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
        />
        <PreviewPanel
          fileName={fileName}
          segments={plan.previewSegments}
          strokeCount={plan.counts.strokeCount}
          fillCount={plan.counts.fillCount}
          fillStrokeCount={plan.counts.fillStrokeCount}
          joinApplied={processing.joinActivated}
          optimizeApplied={optimizeApplied}
          visibleSegmentCount={visibleSegmentCount}
          hoverHighlight={highlight.hoverHighlight}
          selectedHighlight={highlight.selectedHighlight}
          onSegmentHover={highlight.onSegmentHover}
          onSegmentSelect={highlight.onSegmentSelect}
          bedWidthMm={gcodeSettings.bedWidthMm}
          bedHeightMm={gcodeSettings.bedHeightMm}
          penWidthMm={penWidthMm}
          step={playback.step}
          totalSteps={plan.listEntries.length}
          playing={playback.playing}
          onStep={playback.setStep}
          onTogglePlaying={playback.togglePlaying}
        />
        <StrokeListPanel
          entries={plan.listEntries}
          step={deferredStep}
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
