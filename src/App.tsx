import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { SettingsPanel } from './components/SettingsPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { StrokeListPanel } from './components/StrokeListPanel'
import { ErrorBanner } from './components/ErrorBanner'
import { BoundsWarningBanner } from './components/BoundsWarningBanner'
import { FillErrorBanner } from './components/FillErrorBanner'
import { InvalidInputBanner } from './components/InvalidInputBanner'
import { parseSvgFile } from './core/svgParser'
import { checkStrokeBounds } from './core/boundsCheck'
import { buildFillBlocks } from './core/fillBlock'
import { generateGcode } from './core/gcodeGenerate'
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
import { DEFAULT_FILL_SETTINGS } from './types/fill'
import { DEFAULT_GCODE_SETTINGS } from './types/gcode'
import type { ListEntry, ParseSettings, PreviewSegment } from './types/svg'

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
  const fillBlocks = useMemo(
    () => buildFillBlocks(fillCandidates, fillSettings),
    [fillCandidates, fillSettings],
  )

  // FR-14: 端点結合(結合ブロック化)。距離閾値+個別上書きから毎回再計算する
  const [joinDistanceMm, setJoinDistanceMm] = useState(DEFAULT_JOIN_DISTANCE_MM)
  const [joinOverrides, setJoinOverrides] = useState<Map<string, boolean>>(
    new Map(),
  )
  const blocks = useMemo(
    () => buildJoinedBlocks(strokes, joinDistanceMm, joinOverrides),
    [strokes, joinDistanceMm, joinOverrides],
  )

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
    setJoinOverrides(new Map())
  }, [fitKey])

  const unitOrder = useMemo(
    () => optimizedOrder?.order ?? units.map((_, i) => i),
    [optimizedOrder, units],
  )
  const unitReversedFlags = useMemo(
    () => optimizedOrder?.reversed ?? units.map(() => false),
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
            hatchLineCount: fb.hatchChains.length,
            hasOutline: fb.outlineLoops !== null,
            error: fb.error,
          },
        ]
      }),
    [materializedUnits],
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
  const drawGroups = useMemo(
    () =>
      materializedUnits.flatMap((m) =>
        m.gcodeSegments.map((points) => ({ points })),
      ),
    [materializedUnits],
  )

  const handleOptimize = (): void => {
    const endpoints = units
      .map((u) => materializeDrawUnit(u, strokes, false))
      .map(travelEndpoints)
    setOptimizedOrder(greedyOptimizeOrder(endpoints, { x: 0, y: 0 }))
  }
  const handleResetOrder = (): void => {
    setOptimizedOrder(null)
    setJoinOverrides(new Map())
  }
  const handleSetJoinOverride = (
    idA: string,
    idB: string,
    join: boolean,
  ): void => {
    setJoinOverrides((prev) => {
      const next = new Map(prev)
      next.set(joinOverrideKey(idA, idB), join)
      return next
    })
  }

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

  useEffect(() => {
    setStep(listEntries.length)
    setPlaying(false)
  }, [fitKey])

  useEffect(() => {
    setStep((s) => Math.min(s, listEntries.length))
  }, [listEntries])

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

  const visibleSegmentCount = useMemo(
    () => segmentCountPerEntry.slice(0, step).reduce((a, b) => a + b, 0),
    [segmentCountPerEntry, step],
  )

  const fillErrors = useMemo(
    () => fillBlocks.flatMap((fb) => (fb.error ? [fb.error] : [])),
    [fillBlocks],
  )

  return (
    <div className="app-shell">
      <ErrorBanner errors={parseResult?.errors ?? []} />
      <BoundsWarningBanner warnings={boundsWarnings} />
      <FillErrorBanner errors={fillErrors} />
      <InvalidInputBanner labels={invalidFieldLabels} />
      <div className="app-layout">
        <SettingsPanel
          fileName={fileName}
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
          fillSettings={fillSettings}
          onFillSettingsChange={setFillSettings}
          onFillInvalidChange={setFillInvalidLabels}
          canDownloadGcode={canDownloadGcode}
          boundsWarningCount={boundsWarnings.length}
          onDownloadGcode={handleDownloadGcode}
        />
        <PreviewPanel
          segments={previewSegments}
          visibleSegmentCount={visibleSegmentCount}
          bedWidthMm={gcodeSettings.bedWidthMm}
          bedHeightMm={gcodeSettings.bedHeightMm}
          step={step}
          totalSteps={listEntries.length}
          playing={playing}
          onStep={(next) => {
            setPlaying(false)
            setStep(next)
          }}
          onTogglePlaying={() => setPlaying((p) => !p)}
        />
        <StrokeListPanel
          entries={listEntries}
          step={step}
          joinOverrides={joinOverrides}
          onSetJoinOverride={handleSetJoinOverride}
          onOptimize={handleOptimize}
          onResetOrder={handleResetOrder}
        />
      </div>
    </div>
  )
}

export default App
