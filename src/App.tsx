import './App.css'
import { SettingsPanel } from './components/SettingsPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { StrokeListPanel } from './components/StrokeListPanel'

function App() {
  return (
    <div className="app-layout">
      <SettingsPanel />
      <PreviewPanel />
      <StrokeListPanel />
    </div>
  )
}

export default App
