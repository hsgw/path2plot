import { useEffect, useRef, useState } from 'react'
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

const PLAY_INTERVAL_MS = 400
const START_MARKER_RADIUS_PX = 4
const ARROW_SIZE_PX = 5

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

/** FR-24: ストローク開始点の◯表示 */
function drawStartMarker(ctx: CanvasRenderingContext2D, at: Point): void {
  ctx.beginPath()
  ctx.arc(at.x, at.y, START_MARKER_RADIUS_PX, 0, Math.PI * 2)
  ctx.stroke()
}

/** FR-24: 描画方向を示す矢印(始点→2点目の向きの中間点に描く) */
function drawDirectionArrow(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
): void {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return
  const ux = dx / len
  const uy = dy / len
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const tipX = midX + ux * ARROW_SIZE_PX
  const tipY = midY + uy * ARROW_SIZE_PX
  const backX = midX - ux * ARROW_SIZE_PX
  const backY = midY - uy * ARROW_SIZE_PX
  const nx = -uy * (ARROW_SIZE_PX * 0.6)
  const ny = ux * (ARROW_SIZE_PX * 0.6)

  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(backX + nx, backY + ny)
  ctx.lineTo(backX - nx, backY - ny)
  ctx.closePath()
  ctx.fill()
}

export function PreviewPanel({ strokes, fitKey }: PreviewPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 直近にフィット基準として採用したmm座標系の範囲。fitKeyが変わったときだけ更新する。
  // これによりDPI/倍率設定を変えたときに(内容に合わせて毎回自動フィットするのではなく)
  // 実際の見た目のサイズが連動して変化するようにする。
  const fitBoundsRef = useRef<Bounds | null>(null)
  const lastFitKeyRef = useRef<string | null>(null)

  // FR-23: ステップ実行プレビュー。stepは「描画済みのストローク本数」(0..strokes.length)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setStep(0)
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

      const drawnStrokes = strokes.slice(0, step)
      const defaultColor = getComputedStyle(canvas).color || '#000'

      // FR-25: ペンアップ移動経路(出現順での単純な移動)
      ctx.save()
      ctx.strokeStyle = '#e04949'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      for (let i = 0; i < drawnStrokes.length - 1; i++) {
        const from = toScreen(drawnStrokes[i].points.at(-1)!)
        const to = toScreen(drawnStrokes[i + 1].points[0])
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      }
      ctx.restore()

      // FR-26: ストロークを実際の色で描画
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (const stroke of drawnStrokes) {
        if (stroke.points.length < 2) continue
        ctx.strokeStyle = stroke.color || defaultColor
        ctx.lineWidth = 1.5
        ctx.beginPath()
        const [first, ...rest] = stroke.points.map(toScreen)
        ctx.moveTo(first.x, first.y)
        for (const p of rest) ctx.lineTo(p.x, p.y)
        ctx.stroke()

        // FR-24: 開始点◯・描画方向の表示
        ctx.fillStyle = stroke.color || defaultColor
        drawStartMarker(ctx, first)
        drawDirectionArrow(ctx, first, rest[0] ?? first)
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    return () => observer.disconnect()
  }, [strokes, fitKey, step])

  const total = strokes.length

  return (
    <section className="panel panel-preview">
      <div className="panel-header">
        <h2>プレビュー</h2>
        <div className="preview-step-controls">
          <button
            type="button"
            onClick={() => {
              setPlaying(false)
              setStep((s) => Math.max(0, s - 1))
            }}
            disabled={step <= 0}
          >
            前へ
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false)
              setStep((s) => Math.min(total, s + 1))
            }}
            disabled={step >= total}
          >
            次へ
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={total === 0}
          >
            {playing ? '停止' : '再生'}
          </button>
          <span className="preview-step-indicator">
            {step} / {total}
          </span>
        </div>
      </div>
      <div className="panel-body panel-body-canvas">
        <canvas ref={canvasRef} className="preview-canvas" />
      </div>
    </section>
  )
}
