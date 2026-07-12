import { useEffect, useRef } from 'react'
import type { Point } from '../types/geometry'
import type { ParsedStroke } from '../types/svg'

interface PreviewPanelProps {
  strokes: ParsedStroke[]
  /** ファイルが差し替わったときだけビューのフィット(拡大縮小・中心合わせ)をやり直すためのキー */
  fitKey: string | null
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function computeBounds(strokes: ParsedStroke[]): Bounds | null {
  if (strokes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  return { minX, minY, maxX, maxY }
}

export function PreviewPanel({ strokes, fitKey }: PreviewPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 直近にフィット基準として採用したmm座標系の範囲。fitKeyが変わったときだけ更新する。
  // これによりDPI/倍率設定を変えたときに(内容に合わせて毎回自動フィットするのではなく)
  // 実際の見た目のサイズが連動して変化するようにする。
  const fitBoundsRef = useRef<Bounds | null>(null)
  const lastFitKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = canvas?.parentElement
    if (!canvas || !container) return

    if (lastFitKeyRef.current !== fitKey) {
      lastFitKeyRef.current = fitKey
      fitBoundsRef.current = null
    }
    if (!fitBoundsRef.current) {
      fitBoundsRef.current = computeBounds(strokes)
    }

    const draw = (): void => {
      const dpr = window.devicePixelRatio || 1
      const width = container.clientWidth
      const height = container.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const bounds = fitBoundsRef.current
      if (!bounds || strokes.length === 0) return

      const boundsWidth = Math.max(bounds.maxX - bounds.minX, 1e-6)
      const boundsHeight = Math.max(bounds.maxY - bounds.minY, 1e-6)
      const padding = 20
      const scale = Math.min(
        (width - padding * 2) / boundsWidth,
        (height - padding * 2) / boundsHeight,
      )
      const offsetX = (width - boundsWidth * scale) / 2
      const offsetY = (height - boundsHeight * scale) / 2

      const toScreen = (p: Point): Point => ({
        x: offsetX + (p.x - bounds.minX) * scale,
        y: height - (offsetY + (p.y - bounds.minY) * scale),
      })

      ctx.strokeStyle = getComputedStyle(canvas).color || '#000'
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (const stroke of strokes) {
        if (stroke.points.length < 2) continue
        ctx.beginPath()
        const [first, ...rest] = stroke.points.map(toScreen)
        ctx.moveTo(first.x, first.y)
        for (const p of rest) ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    return () => observer.disconnect()
  }, [strokes, fitKey])

  return (
    <section className="panel panel-preview">
      <div className="panel-header">
        <h2>プレビュー</h2>
      </div>
      <div className="panel-body panel-body-canvas">
        <canvas ref={canvasRef} className="preview-canvas" />
      </div>
    </section>
  )
}
