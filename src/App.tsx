import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { SettingsPanel } from './components/SettingsPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { StrokeListPanel } from './components/StrokeListPanel'
import { ErrorBanner } from './components/ErrorBanner'
import { BoundsWarningBanner } from './components/BoundsWarningBanner'
import { InvalidInputBanner } from './components/InvalidInputBanner'
import { parseSvgFile } from './core/svgParser'
import { checkStrokeBounds } from './core/boundsCheck'
import { generateGcode } from './core/gcodeGenerate'
import {
  buildJoinedBlocks,
  greedyOptimizeOrder,
  joinOverrideKey,
  materializeBlock,
} from './core/strokeJoin'
import { DEFAULT_GCODE_SETTINGS } from './types/gcode'
import type { OrderedStroke, ParseSettings } from './types/svg'

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
  const invalidFieldLabels = useMemo(
    () => [...settingsInvalidLabels, ...gcodeInvalidLabels],
    [settingsInvalidLabels, gcodeInvalidLabels],
  )

  const parseResult = useMemo(() => {
    if (svgText === null) return null
    return parseSvgFile(svgText, settings)
  }, [svgText, settings])

  const strokes = parseResult?.strokes ?? []
  const fitKey = svgText === null ? null : String(loadId)

  // FR-14: 端点結合(結合ブロック化)。距離閾値+個別上書きから毎回再計算する
  const [joinDistanceMm, setJoinDistanceMm] = useState(DEFAULT_JOIN_DISTANCE_MM)
  const [joinOverrides, setJoinOverrides] = useState<Map<string, boolean>>(
    new Map(),
  )
  const blocks = useMemo(
    () => buildJoinedBlocks(strokes, joinDistanceMm, joinOverrides),
    [strokes, joinDistanceMm, joinOverrides],
  )

  // FR-15: 貪欲法による並び替え結果(「最適化」ボタン押下時のみ設定)。
  // ブロック構成が変わるような幾何変更(ファイル再読込・結合距離変更等)が起きたら破棄する
  const [optimizedOrder, setOptimizedOrder] = useState<{
    order: number[]
    reversed: boolean[]
  } | null>(null)
  useEffect(() => {
    setOptimizedOrder(null)
  }, [blocks])
  useEffect(() => {
    setJoinOverrides(new Map())
  }, [fitKey])

  const blockOrder = useMemo(
    () => optimizedOrder?.order ?? blocks.map((_, i) => i),
    [optimizedOrder, blocks],
  )
  const blockReversedFlags = useMemo(
    () => optimizedOrder?.reversed ?? blocks.map(() => false),
    [optimizedOrder, blocks],
  )
  const materialized = useMemo(
    () =>
      blockOrder.map((blockIdx, i) =>
        materializeBlock(blocks[blockIdx], strokes, blockReversedFlags[i]),
      ),
    [blockOrder, blockReversedFlags, blocks, strokes],
  )
  const orderedStrokes: OrderedStroke[] = useMemo(
    () =>
      materialized.flatMap((m, blockId) =>
        m.strokes.map((s) => ({ ...s, blockId })),
      ),
    [materialized],
  )
  const drawGroups = useMemo(
    () => materialized.map((m) => ({ points: m.points })),
    [materialized],
  )

  const handleOptimize = (): void => {
    const units = blocks.map((b) => materializeBlock(b, strokes, false))
    setOptimizedOrder(greedyOptimizeOrder(units, { x: 0, y: 0 }))
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
    strokes.length > 0 &&
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

  // FR-23: ステップ実行プレビュー。読込み直後は最終ステップ(全ストローク描画済み)を初期表示とする
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setStep(strokes.length)
    setPlaying(false)
  }, [fitKey])

  useEffect(() => {
    setStep((s) => Math.min(s, strokes.length))
  }, [strokes])

  useEffect(() => {
    if (!playing) return
    if (step >= strokes.length) {
      setPlaying(false)
      return
    }
    const timer = setInterval(() => {
      setStep((s) => {
        if (s + 1 >= strokes.length) {
          setPlaying(false)
          return strokes.length
        }
        return s + 1
      })
    }, PLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [playing, step, strokes.length])

  return (
    <div className="app-shell">
      <ErrorBanner errors={parseResult?.errors ?? []} />
      <BoundsWarningBanner warnings={boundsWarnings} />
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
          canDownloadGcode={canDownloadGcode}
          boundsWarningCount={boundsWarnings.length}
          onDownloadGcode={handleDownloadGcode}
        />
        <PreviewPanel
          strokes={orderedStrokes}
          bedWidthMm={gcodeSettings.bedWidthMm}
          bedHeightMm={gcodeSettings.bedHeightMm}
          step={step}
          playing={playing}
          onStep={(next) => {
            setPlaying(false)
            setStep(next)
          }}
          onTogglePlaying={() => setPlaying((p) => !p)}
        />
        <StrokeListPanel
          strokes={orderedStrokes}
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
