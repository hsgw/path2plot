import { useEffect, useRef } from 'react'
import type { Point } from '../types/geometry'
import type { OrderedStroke } from '../types/svg'

interface PreviewPanelProps {
  strokes: OrderedStroke[]
  /** 想定描画可能領域(FR-35)の幅・高さ(mm)。プレビューはこの大きさを基準に固定表示する */
  bedWidthMm: number
  bedHeightMm: number
  /** FR-23: ステップ実行プレビュー。描画済みのストローク本数(0..strokes.length) */
  step: number
  playing: boolean
  onStep: (next: number) => void
  onTogglePlaying: () => void
}

const START_MARKER_RADIUS_PX = 4
const ARROW_SIZE_PX = 5
const GHOST_ALPHA = 0.2
const BED_FILL_COLOR = '#ffffff'

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

/** 1本のストロークを実線で描画し、開始点の画面座標を返す */
function strokeOutline(
  ctx: CanvasRenderingContext2D,
  stroke: OrderedStroke,
  toScreen: (p: Point) => Point,
  defaultColor: string,
): Point | null {
  if (stroke.points.length < 2) return null
  ctx.strokeStyle = stroke.color || defaultColor
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const [first, ...rest] = stroke.points.map(toScreen)
  ctx.moveTo(first.x, first.y)
  for (const p of rest) ctx.lineTo(p.x, p.y)
  ctx.stroke()
  return first
}

export function PreviewPanel({
  strokes,
  bedWidthMm,
  bedHeightMm,
  step,
  playing,
  onStep,
  onTogglePlaying,
}: PreviewPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = canvas?.parentElement
    if (!canvas || !container) return

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

      // プレビューは想定描画可能領域(FR-35)の大きさを基準に固定表示する(DPI/倍率設定を変えても
      // ビュー自体は拡大縮小されず、はみ出し具合がそのまま見た目に反映される)
      const boundsWidth = Math.max(bedWidthMm, 1e-6)
      const boundsHeight = Math.max(bedHeightMm, 1e-6)
      const padding = 20
      const scale = Math.min(
        (width - padding * 2) / boundsWidth,
        (height - padding * 2) / boundsHeight,
      )
      const offsetX = (width - boundsWidth * scale) / 2
      const offsetY = (height - boundsHeight * scale) / 2

      const toScreen = (p: Point): Point => ({
        x: offsetX + p.x * scale,
        y: height - (offsetY + p.y * scale),
      })

      // 想定ベッドサイズの枠のみを白で塗り、外側はアプリ背景色のまま(CSS側で未設定にして透過させている)
      ctx.fillStyle = BED_FILL_COLOR
      ctx.fillRect(offsetX, offsetY, boundsWidth * scale, boundsHeight * scale)

      const drawnStrokes = strokes.slice(0, step)
      const defaultColor = getComputedStyle(canvas).color || '#000'

      // ゴースト表示: ステップを戻しても全体像を失わないよう、全ストロークを薄く常時描画する
      ctx.save()
      ctx.globalAlpha = GHOST_ALPHA
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (const stroke of strokes) {
        strokeOutline(ctx, stroke, toScreen, defaultColor)
      }
      ctx.restore()

      // FR-25: ペンアップ移動経路。同一結合ブロック(FR-14)内の連続ストローク間はペンを
      // 上げずに連続描画されるため、その区間は移動経路を描かない
      ctx.save()
      ctx.strokeStyle = '#e04949'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      for (let i = 0; i < drawnStrokes.length - 1; i++) {
        if (drawnStrokes[i].blockId === drawnStrokes[i + 1].blockId) continue
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
        const first = strokeOutline(ctx, stroke, toScreen, defaultColor)
        if (!first) continue

        // FR-24: 開始点◯・描画方向の表示
        ctx.fillStyle = stroke.color || defaultColor
        drawStartMarker(ctx, first)
        drawDirectionArrow(ctx, first, toScreen(stroke.points[1]))
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    return () => observer.disconnect()
  }, [strokes, bedWidthMm, bedHeightMm, step])

  const total = strokes.length

  return (
    <section className="panel panel-preview">
      <div className="panel-header">
        <h2>プレビュー</h2>
        <div className="preview-step-controls">
          <button
            type="button"
            onClick={() => onStep(Math.max(0, step - 1))}
            disabled={step <= 0}
          >
            前へ
          </button>
          <button
            type="button"
            onClick={() => onStep(Math.min(total, step + 1))}
            disabled={step >= total}
          >
            次へ
          </button>
          <button
            type="button"
            onClick={onTogglePlaying}
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
