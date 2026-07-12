import { useMemo, useState } from 'react'
import './App.css'
import { SettingsPanel } from './components/SettingsPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { StrokeListPanel } from './components/StrokeListPanel'
import { parseSvgFile } from './core/svgParser'
import type { ParseSettings } from './types/svg'

const DEFAULT_SETTINGS: ParseSettings = {
  dpi: 96,
  scaleFactor: 1,
  bezierToleranceMm: 0.1,
}

function App() {
  const [svgText, setSvgText] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [loadId, setLoadId] = useState(0)
  const [settings, setSettings] = useState<ParseSettings>(DEFAULT_SETTINGS)

  const parseResult = useMemo(() => {
    if (svgText === null) return null
    return parseSvgFile(svgText, settings)
  }, [svgText, settings])

  return (
    <div className="app-layout">
      <SettingsPanel
        fileName={fileName}
        settings={settings}
        errors={parseResult?.errors ?? []}
        onFileSelected={(text, name) => {
          setSvgText(text)
          setFileName(name)
          setLoadId((id) => id + 1)
        }}
        onSettingsChange={setSettings}
      />
      <PreviewPanel
        strokes={parseResult?.strokes ?? []}
        fitKey={svgText === null ? null : String(loadId)}
      />
      <StrokeListPanel />
    </div>
  )
}

export default App
