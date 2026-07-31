import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Point } from '../types/geometry'
import type { HighlightRange, PreviewSegment } from '../types/svg'

interface PreviewPanelProps {
  fileName: string | null
  segments: PreviewSegment[]
  /** segmentsのうち実際に描画済み表示する本数(FR-23: ステップはListEntry単位、セグメント単位ではない) */
  visibleSegmentCount: number
  /** FR-43: ストロークリストでホバー中/選択中の行に対応するセグメント範囲(未描画分も強調する) */
  hoverHighlight: HighlightRange | null
  selectedHighlight: HighlightRange | null
  /** 想定描画可能領域(FR-35)の幅・高さ(mm)。プレビューはこの大きさを基準に固定表示する */
  bedWidthMm: number
  bedHeightMm: number
  /** FR-23: ステップ実行プレビュー。ListEntry単位の現在位置・総数 */
  step: number
  totalSteps: number
  playing: boolean
  onStep: (next: number) => void
  onTogglePlaying: () => void
}

interface View {
  dpr: number
  width: number
  height: number
  boundsWidth: number
  boundsHeight: number
  scale: number
  offsetX: number
  offsetY: number
}

const START_MARKER_RADIUS_PX = 4
const ARROW_SIZE_PX = 5
const GHOST_ALPHA = 0.2
const BED_FILL_COLOR = '#ffffff'
const PADDING_PX = 20
// FR-43: ホバーと選択(クリック)で色を変え、どちらの操作による強調かを区別できるようにする
const HOVER_HIGHLIGHT_COLOR = '#ff9500'
const SELECTED_HIGHLIGHT_COLOR = '#0a84ff'
const HIGHLIGHT_LINE_WIDTH = 3.5

function computeView(
  width: number,
  height: number,
  bedWidthMm: number,
  bedHeightMm: number,
): View {
  const dpr = window.devicePixelRatio || 1
  const boundsWidth = Math.max(bedWidthMm, 1e-6)
  const boundsHeight = Math.max(bedHeightMm, 1e-6)
  const scale =
    width > 0 && height > 0
      ? Math.min(
          (width - PADDING_PX * 2) / boundsWidth,
          (height - PADDING_PX * 2) / boundsHeight,
        )
      : 0
  const offsetX = (width - boundsWidth * scale) / 2
  const offsetY = (height - boundsHeight * scale) / 2
  return {
    dpr,
    width,
    height,
    boundsWidth,
    boundsHeight,
    scale,
    offsetX,
    offsetY,
  }
}

/** FR-24: 開始点の◯表示 */
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

/**
 * セグメントの折線を現在のパスへ追加する(beginPath・strokeStyle等の指定は呼び出し側の責務)。
 * moveToで始まるため、複数セグメントを1つのパスへ連続して積める
 */
function appendSegmentPath(
  ctx: CanvasRenderingContext2D,
  segment: PreviewSegment,
  toX: (p: Point) => number,
  toY: (p: Point) => number,
): void {
  const p0 = segment.points[0]
  ctx.moveTo(toX(p0), toY(p0))
  for (let i = 1; i < segment.points.length; i++) {
    const p = segment.points[i]
    ctx.lineTo(toX(p), toY(p))
  }
}

/**
 * 1本のセグメントを実線で描画し、開始点の画面座標を返す。
 * toX/toYは画面座標を直接返す関数として渡し、Point配列の中間確保(.map)を避ける
 */
function drawSegmentStroke(
  ctx: CanvasRenderingContext2D,
  segment: PreviewSegment,
  toX: (p: Point) => number,
  toY: (p: Point) => number,
  defaultColor: string,
): Point | null {
  if (segment.points.length < 2) return null
  ctx.strokeStyle = segment.color || defaultColor
  ctx.lineWidth = 1.5
  ctx.beginPath()
  appendSegmentPath(ctx, segment, toX, toY)
  ctx.stroke()
  const p0 = segment.points[0]
  return { x: toX(p0), y: toY(p0) }
}

/**
 * FR-43: ハイライト対象の範囲[start, end)を、実色より太い単色の線で上書き描画する。
 * 単色なので、範囲全体を1つのパスにまとめてstrokeは1回だけ呼ぶ
 * (ハッチ線が数千本ある塗りブロックをハイライトしたときのコストを抑える)
 */
function drawHighlightRange(
  ctx: CanvasRenderingContext2D,
  segments: PreviewSegment[],
  range: HighlightRange | null,
  color: string,
  toX: (p: Point) => number,
  toY: (p: Point) => number,
): void {
  if (!range) return
  const from = Math.max(0, range.start)
  const to = Math.min(range.end, segments.length)
  ctx.strokeStyle = color
  ctx.beginPath()
  for (let i = from; i < to; i++) {
    const segment = segments[i]
    if (segment.points.length < 2) continue
    appendSegmentPath(ctx, segment, toX, toY)
  }
  ctx.stroke()
}

/** FR-25: ペンアップ移動経路(赤の破線)を[from, to)の範囲だけ描く */
function drawPenLifts(
  ctx: CanvasRenderingContext2D,
  segments: PreviewSegment[],
  from: number,
  to: number,
  toX: (p: Point) => number,
  toY: (p: Point) => number,
): void {
  ctx.save()
  ctx.strokeStyle = '#e04949'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  for (let i = from; i < to - 1; i++) {
    if (!segments[i + 1].penLiftBefore) continue
    const start = segments[i].points.at(-1)!
    const end = segments[i + 1].points[0]
    ctx.beginPath()
    ctx.moveTo(toX(start), toY(start))
    ctx.lineTo(toX(end), toY(end))
    ctx.stroke()
  }
  ctx.restore()
}

function PreviewPanelImpl({
  fileName,
  segments,
  visibleSegmentCount,
  hoverHighlight,
  selectedHighlight,
  bedWidthMm,
  bedHeightMm,
  step,
  totalSteps,
  playing,
  onStep,
  onTogglePlaying,
}: PreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasBaseRef = useRef<HTMLCanvasElement>(null)
  const canvasActiveRef = useRef<HTMLCanvasElement>(null)
  const canvasHighlightRef = useRef<HTMLCanvasElement>(null)
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 })

  // ベース(ゴースト)レイヤーの描画済み色・アクティブレイヤーの差分描画状態を、
  // ステップ操作のたびに再生成せずレイヤー間で共有するためのref
  const defaultColorRef = useRef('#000')
  const renderedCountRef = useRef(0)
  const lastSegmentsRef = useRef<PreviewSegment[] | null>(null)
  const lastViewRef = useRef<View | null>(null)

  const view = useMemo(
    () => computeView(viewSize.width, viewSize.height, bedWidthMm, bedHeightMm),
    [viewSize, bedWidthMm, bedHeightMm],
  )

  // コンテナのリサイズ監視。実際にサイズが変化した場合のみstateを更新し(rAFでコアレス)、
  // ResizeObserverの生成自体はマウント時の1回のみに抑える
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = (): void => {
      const width = container.clientWidth
      const height = container.clientHeight
      setViewSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      )
    }

    measure()
    let rafId = 0
    const observer = new ResizeObserver(() => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        measure()
      })
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  // ベースレイヤー: ベッド白塗り+全セグメントのゴースト表示(FR-23のstepには依存しない静的レイヤー)
  useEffect(() => {
    const canvas = canvasBaseRef.current
    if (!canvas || view.width === 0 || view.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = view.width * view.dpr
    canvas.height = view.height * view.dpr
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
    ctx.clearRect(0, 0, view.width, view.height)

    ctx.fillStyle = BED_FILL_COLOR
    ctx.fillRect(
      view.offsetX,
      view.offsetY,
      view.boundsWidth * view.scale,
      view.boundsHeight * view.scale,
    )

    const defaultColor = getComputedStyle(canvas).color || '#000'
    defaultColorRef.current = defaultColor

    const toX = (p: Point): number => view.offsetX + p.x * view.scale
    const toY = (p: Point): number =>
      view.height - (view.offsetY + p.y * view.scale)

    ctx.save()
    ctx.globalAlpha = GHOST_ALPHA
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const segment of segments) {
      drawSegmentStroke(ctx, segment, toX, toY, defaultColor)
    }
    ctx.restore()
  }, [segments, view])

  // アクティブレイヤー: ペンアップ移動経路+実色描画+開始点◯+方向矢印。
  // 直前の描画からsegments/viewが変わらず、可視本数が増えただけの場合(次へ/再生)は
  // 新規区間だけを追記描画し、それ以外(戻す/ファイル再読込/リサイズ)は全体を描き直す
  useEffect(() => {
    const canvas = canvasActiveRef.current
    if (!canvas || view.width === 0 || view.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const canAppend =
      lastSegmentsRef.current === segments &&
      lastViewRef.current === view &&
      visibleSegmentCount >= renderedCountRef.current

    if (!canAppend) {
      canvas.width = view.width * view.dpr
      canvas.height = view.height * view.dpr
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
      ctx.clearRect(0, 0, view.width, view.height)
      renderedCountRef.current = 0
    }

    const start = renderedCountRef.current
    if (start < visibleSegmentCount) {
      const toX = (p: Point): number => view.offsetX + p.x * view.scale
      const toY = (p: Point): number =>
        view.height - (view.offsetY + p.y * view.scale)
      const defaultColor = defaultColorRef.current

      // FR-25: penLiftBefore=falseの区間(FR-14の結合ブロック内部)は移動経路を描かない
      drawPenLifts(
        ctx,
        segments,
        Math.max(0, start - 1),
        visibleSegmentCount,
        toX,
        toY,
      )

      // FR-26: 実際の色で描画
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (let i = start; i < visibleSegmentCount; i++) {
        const segment = segments[i]
        const first = drawSegmentStroke(ctx, segment, toX, toY, defaultColor)
        if (!first) continue

        // FR-24: 開始点◯・描画方向の表示
        ctx.fillStyle = segment.color || defaultColor
        drawStartMarker(ctx, first)
        drawDirectionArrow(ctx, first, {
          x: toX(segment.points[1]),
          y: toY(segment.points[1]),
        })
      }
    }

    renderedCountRef.current = visibleSegmentCount
    lastSegmentsRef.current = segments
    lastViewRef.current = view
  }, [segments, visibleSegmentCount, view])

  // ハイライトレイヤー(FR-43): リストでホバー中/選択中のセグメントを最前面に描き直す。
  // ステップ位置に依存させず未描画のストロークも強調し、リスト行から位置を辿れるようにする。
  // 独立したCanvasに分けることで、アクティブレイヤーの差分追記描画を壊さずに毎回消去できる
  useEffect(() => {
    const canvas = canvasHighlightRef.current
    if (!canvas || view.width === 0 || view.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // width代入でレイヤー全体がクリアされる(前回のハイライトを消す)
    canvas.width = view.width * view.dpr
    canvas.height = view.height * view.dpr
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
    if (!hoverHighlight && !selectedHighlight) return

    const toX = (p: Point): number => view.offsetX + p.x * view.scale
    const toY = (p: Point): number =>
      view.height - (view.offsetY + p.y * view.scale)

    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.lineWidth = HIGHLIGHT_LINE_WIDTH
    // 選択とホバーが別の行を指している場合は両方を表示し、同じ行ならホバー色を上に重ねる
    drawHighlightRange(
      ctx,
      segments,
      selectedHighlight,
      SELECTED_HIGHLIGHT_COLOR,
      toX,
      toY,
    )
    drawHighlightRange(
      ctx,
      segments,
      hoverHighlight,
      HOVER_HIGHLIGHT_COLOR,
      toX,
      toY,
    )
  }, [segments, view, hoverHighlight, selectedHighlight])

  return (
    <section className="panel panel-preview">
      <div className="panel-header">
        <div className="preview-title">
          <h2>プレビュー</h2>
          <span className="preview-filename">{fileName ?? 'ファイルなし'}</span>
        </div>
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
            onClick={() => onStep(Math.min(totalSteps, step + 1))}
            disabled={step >= totalSteps}
          >
            次へ
          </button>
          <button
            type="button"
            onClick={onTogglePlaying}
            disabled={totalSteps === 0}
          >
            {playing ? '停止' : '再生'}
          </button>
          <span className="preview-step-indicator">
            {step} / {totalSteps}
          </span>
        </div>
      </div>
      <div className="panel-body panel-body-canvas" ref={containerRef}>
        <canvas ref={canvasBaseRef} className="preview-canvas" />
        <canvas ref={canvasActiveRef} className="preview-canvas" />
        <canvas ref={canvasHighlightRef} className="preview-canvas" />
      </div>
    </section>
  )
}

export const PreviewPanel = memo(PreviewPanelImpl)
