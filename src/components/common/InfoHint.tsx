import { type ReactNode, useEffect, useRef, useState } from 'react'
import { QuestionMarkCircleIcon } from './icons'

interface InfoHintProps {
  text: string
  children: ReactNode
}

const BUBBLE_WIDTH_PX = 220
const BUBBLE_GAP_PX = 4
const VIEWPORT_MARGIN_PX = 8

/**
 * 設定項目のラベル(children)に補足説明(text)を添える。ラベル文言または?アイコンを
 * ホバー/クリックすると、トリガーの上側に吹き出しで説明文を表示する(下に出すと設定列の
 * 下端で見切れることがあるため上向き固定)。position:fixedで画面座標に直接配置する
 * (親の.settings-tabpanelはoverflow-y:autoによりoverflow-xも暗黙にautoになるため、
 * position:absoluteで祖先の外へはみ出すと横スクロールが出てしまう)
 */
export function InfoHint({ text, children }: InfoHintProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ bottom: 0, left: 0 })
  const containerRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // クリックで開いた場合はホバーが外れても閉じない(ホバーはあくまで一時プレビュー)
  const pinnedRef = useRef(false)

  const show = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setPosition({
        bottom: window.innerHeight - rect.top + BUBBLE_GAP_PX,
        left: Math.min(
          rect.left,
          window.innerWidth - BUBBLE_WIDTH_PX - VIEWPORT_MARGIN_PX,
        ),
      })
    }
    setOpen(true)
  }
  const hide = (): void => {
    pinnedRef.current = false
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: PointerEvent): void => {
      if (
        e.target instanceof Node &&
        containerRef.current?.contains(e.target)
      ) {
        return
      }
      hide()
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <span className="info-hint" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="info-hint-trigger"
        onMouseEnter={() => {
          if (!open) show()
        }}
        onMouseLeave={() => {
          if (!pinnedRef.current) setOpen(false)
        }}
        onClick={(e) => {
          e.preventDefault()
          if (open && pinnedRef.current) {
            hide()
            return
          }
          pinnedRef.current = true
          show()
        }}
      >
        {children}
        <QuestionMarkCircleIcon />
      </button>
      {open && (
        <span
          className="info-hint-bubble"
          role="tooltip"
          style={{ bottom: position.bottom, left: position.left }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
