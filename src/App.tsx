import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { SettingsPanel } from './components/SettingsPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { StrokeListPanel } from './components/StrokeListPanel'
import { ErrorBanner } from './components/ErrorBanner'
import { parseSvgFile } from './core/svgParser'
import type { ParseSettings } from './types/svg'

const DEFAULT_SETTINGS: ParseSettings = {
  dpi: 96,
  scaleFactor: 1,
  bezierToleranceMm: 0.1,
}

const PLAY_INTERVAL_MS = 400

function App() {
  const [svgText, setSvgText] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [loadId, setLoadId] = useState(0)
  const [settings, setSettings] = useState<ParseSettings>(DEFAULT_SETTINGS)

  const parseResult = useMemo(() => {
    if (svgText === null) return null
    return parseSvgFile(svgText, settings)
  }, [svgText, settings])

  const strokes = parseResult?.strokes ?? []
  const fitKey = svgText === null ? null : String(loadId)

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
        />
        <PreviewPanel
          strokes={strokes}
          fitKey={fitKey}
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
