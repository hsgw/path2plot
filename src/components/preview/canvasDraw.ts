import type { Point } from '../../core/geometry/types'
import type { HighlightRange, PreviewSegment } from '../../core/plan/types'
import type { Projector } from './view'

const START_MARKER_RADIUS_PX = 4
const ARROW_SIZE_PX = 5
const PEN_LIFT_COLOR = '#e04949'

export const GHOST_ALPHA = 0.2
export const BED_FILL_COLOR = '#ffffff'
export const STROKE_LINE_WIDTH_PX = 1.5
// FR-43: ホバーと選択(クリック)で色を変え、どちらの操作による強調かを区別できるようにする
export const HOVER_HIGHLIGHT_COLOR = '#ff9500'
export const SELECTED_HIGHLIGHT_COLOR = '#0a84ff'
// 実線と同じ太さで上書きするだけにし、線が太くなったように見えないようにする
export const HIGHLIGHT_LINE_WIDTH = STROKE_LINE_WIDTH_PX

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
  { toX, toY }: Projector,
): void {
  const p0 = segment.points[0]
  ctx.moveTo(toX(p0), toY(p0))
  for (let i = 1; i < segment.points.length; i++) {
    const p = segment.points[i]
    ctx.lineTo(toX(p), toY(p))
  }
}

/** 1本のセグメントを実線で描画し、開始点の画面座標を返す */
export function drawSegmentStroke(
  ctx: CanvasRenderingContext2D,
  segment: PreviewSegment,
  projector: Projector,
  defaultColor: string,
): Point | null {
  if (segment.points.length < 2) return null
  ctx.strokeStyle = segment.color || defaultColor
  ctx.lineWidth = STROKE_LINE_WIDTH_PX
  ctx.beginPath()
  appendSegmentPath(ctx, segment, projector)
  ctx.stroke()
  const p0 = segment.points[0]
  return { x: projector.toX(p0), y: projector.toY(p0) }
}

/** FR-24: 1本のセグメントの開始点◯と描画方向の矢印 */
export function drawSegmentDirection(
  ctx: CanvasRenderingContext2D,
  segment: PreviewSegment,
  start: Point,
  projector: Projector,
  defaultColor: string,
): void {
  ctx.fillStyle = segment.color || defaultColor
  drawStartMarker(ctx, start)
  drawDirectionArrow(ctx, start, {
    x: projector.toX(segment.points[1]),
    y: projector.toY(segment.points[1]),
  })
}

/**
 * FR-43: ハイライト対象の範囲[start, end)を、実色より太い単色の線で上書き描画する。
 * 単色なので、範囲全体を1つのパスにまとめてstrokeは1回だけ呼ぶ
 * (ハッチ線が数千本ある塗りブロックをハイライトしたときのコストを抑える)
 */
export function drawHighlightRange(
  ctx: CanvasRenderingContext2D,
  segments: PreviewSegment[],
  range: HighlightRange | null,
  color: string,
  projector: Projector,
): void {
  if (!range) return
  const from = Math.max(0, range.start)
  const to = Math.min(range.end, segments.length)
  ctx.strokeStyle = color
  ctx.beginPath()
  for (let i = from; i < to; i++) {
    const segment = segments[i]
    if (segment.points.length < 2) continue
    appendSegmentPath(ctx, segment, projector)
  }
  ctx.stroke()
}

/** FR-25: ペンアップ移動経路(赤の破線)を[from, to)の範囲だけ描く */
export function drawPenLifts(
  ctx: CanvasRenderingContext2D,
  segments: PreviewSegment[],
  from: number,
  to: number,
  { toX, toY }: Projector,
): void {
  ctx.save()
  ctx.strokeStyle = PEN_LIFT_COLOR
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  for (let i = from; i < to - 1; i++) {
    // FR-14の結合ブロック内部(penLiftBefore=false)はペンを上げないので線を引かない
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
