import { useState } from 'react'

export function SettingsPanel() {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <section
      className={`panel panel-settings${isOpen ? '' : ' panel-collapsed'}`}
    >
      <div className="panel-header">
        {isOpen && <h2>設定</h2>}
        <button type="button" onClick={() => setIsOpen((v) => !v)}>
          {isOpen ? '«' : '»'}
        </button>
      </div>
      {isOpen && <div className="panel-body" />}
    </section>
  )
}
