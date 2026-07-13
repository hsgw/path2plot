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
import { DEFAULT_GCODE_SETTINGS } from './types/gcode'
import type { ParseSettings } from './types/svg'

const DEFAULT_SETTINGS: ParseSettings = {
  // Illustrator書き出しSVGの標準的な座標系(1 user unit = 1pt = 1/72インチ)に合わせた既定値
  dpi: 72,
  scaleFactor: 1,
  bezierToleranceMm: 0.1,
}

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
    const gcode = generateGcode(strokes, gcodeSettings)
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
          canDownloadGcode={canDownloadGcode}
          boundsWarningCount={boundsWarnings.length}
          onDownloadGcode={handleDownloadGcode}
        />
        <PreviewPanel
          strokes={strokes}
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
        <StrokeListPanel strokes={strokes} step={step} />
      </div>
    </div>
  )
}

export default App
