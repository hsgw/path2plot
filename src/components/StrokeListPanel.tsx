import { useState } from 'react'
import type { ParsedStroke } from '../types/svg'

interface StrokeListPanelProps {
  strokes: ParsedStroke[]
}

export function StrokeListPanel({ strokes }: StrokeListPanelProps) {
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
      {isOpen && (
        <div className="panel-body">
          <ol className="stroke-list">
            {strokes.map((stroke, i) => (
              <li key={stroke.id} className="stroke-list-item">
                <span className="stroke-list-index">{i + 1}</span>
                <span
                  className="stroke-list-swatch"
                  style={{ backgroundColor: stroke.color }}
                />
                <span className="stroke-list-label">
                  {stroke.sourceId ?? stroke.id}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
