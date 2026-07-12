import { useState } from 'react'

export function StrokeListPanel() {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <section
      className={`panel panel-stroke-list${isOpen ? '' : ' panel-collapsed'}`}
    >
      <div className="panel-header">
        <button type="button" onClick={() => setIsOpen((v) => !v)}>
          {isOpen ? '»' : '«'}
        </button>
        {isOpen && <h2>ストローク並び順</h2>}
      </div>
      {isOpen && <div className="panel-body" />}
    </section>
  )
}
