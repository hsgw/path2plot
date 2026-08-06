import {
  memo,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { findSegmentAtPoint } from '../../core/plan/segmentHitTest'
import type { HighlightRange, PreviewSegment } from '../../core/plan/types'
import {
  BED_FILL_COLOR,
  GHOST_ALPHA,
  HOVER_HIGHLIGHT_COLOR,
  SELECTED_HIGHLIGHT_COLOR,
  STROKE_LINE_WIDTH_PX,
  drawHighlightRange,
  drawPenLifts,
  drawSegmentDirection,
  drawSegmentStroke,
} from './canvasDraw'
import { PreviewHeader } from './PreviewHeader'
import {
  computeView,
  createProjector,
  resetCanvas,
  screenToMm,
  type View,
} from './view'

/** FR-43(プレビュー→リスト方向): この画面px以内に近いセグメントをヒット対象とする */
const HIT_TEST_THRESHOLD_PX = 6

interface PreviewPanelProps {
  fileName: string | null
  segments: PreviewSegment[]
  strokeCount: number
  fillCount: number
  fillStrokeCount: number
  joinApplied: boolean
  optimizeApplied: boolean
  /** segmentsのうち実際に描画済み表示する本数(FR-23: ステップはListEntry単位、セグメント単位ではない) */
  visibleSegmentCount: number
  /** FR-43: ストロークリストでホバー中/選択中の行に対応するセグメント範囲(未描画分も強調する) */
  hoverHighlight: HighlightRange | null
  selectedHighlight: HighlightRange | null
  /** FR-43(プレビュー→リスト方向): プレビュー上でのホバー/クリックを対応するリスト行へ伝える */
  onSegmentHover: (segmentIndex: number | null) => void
  onSegmentSelect: (segmentIndex: number) => void
  /** 想定描画可能領域(FR-35)の幅・高さ(mm)。プレビューはこの大きさを基準に固定表示する */
  bedWidthMm: number
  bedHeightMm: number
  /** FR-28: ペン先の太さ(mm)。0=未入力(実太さ表示は無効化される) */
  penWidthMm: number
  step: number
  totalSteps: number
  playing: boolean
  onStep: (next: number) => void
  onTogglePlaying: () => void
}

/** コンテナのサイズ変化を監視する(実際に変化したときだけstateを更新し、rAFでコアレスする) */
function useContainerSize(
  containerRef: React.RefObject<HTMLDivElement | null>,
): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = (): void => {
      const width = container.clientWidth
      const height = container.clientHeight
      setSize((prev) =>
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
  }, [containerRef])

  return size
}

/**
 * プレビュー列。描画は4枚のCanvasを重ねて分担する(ステップ操作のたびに全体を描き直すと
 * 大規模SVGで数百msかかるため):
 *  - ベース: ベッドの白塗り+全セグメントのゴースト表示(stepに依存しない)
 *  - アクティブ: 実色(またはFR-28の実太さ表示中は黒)の描画+ペンアップ移動(stepに追従、進む方向は追記のみ)
 *  - マーカー: 開始点◯+方向矢印(固定色・固定線幅、stepに追従、進む方向は追記のみ)。
 *    アクティブレイヤーより上に独立したCanvasとして重ね、インクの太さ・描画順に関わらず
 *    常にインクの上に見えるようにする
 *  - ハイライト: リストのホバー/選択に対応する強調(毎回クリアして描き直す)
 */
function PreviewPanelImpl({
  fileName,
  segments,
  strokeCount,
  fillCount,
  fillStrokeCount,
  joinApplied,
  optimizeApplied,
  visibleSegmentCount,
  hoverHighlight,
  selectedHighlight,
  onSegmentHover,
  onSegmentSelect,
  bedWidthMm,
  bedHeightMm,
  penWidthMm,
  step,
  totalSteps,
  playing,
  onStep,
  onTogglePlaying,
}: PreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasBaseRef = useRef<HTMLCanvasElement>(null)
  const canvasActiveRef = useRef<HTMLCanvasElement>(null)
  const canvasMarkersRef = useRef<HTMLCanvasElement>(null)
  const canvasHighlightRef = useRef<HTMLCanvasElement>(null)
  const viewSize = useContainerSize(containerRef)

  // ベースレイヤーで解決した既定色と、アクティブレイヤーの差分描画状態をレイヤー間で共有するref
  const defaultColorRef = useRef('#000')
  const renderedCountRef = useRef(0)
  const lastSegmentsRef = useRef<PreviewSegment[] | null>(null)
  const lastViewRef = useRef<View | null>(null)
  const lastLineWidthPxRef = useRef(STROKE_LINE_WIDTH_PX)

  // マーカーレイヤー(開始点◯・方向矢印)専用の差分描画状態
  const renderedMarkerCountRef = useRef(0)
  const lastMarkerSegmentsRef = useRef<PreviewSegment[] | null>(null)
  const lastMarkerViewRef = useRef<View | null>(null)
  const lastMarkerShowDirectionRef = useRef(true)

  // FR-24の開始点◯・方向矢印の表示切り替え(既定は表示)
  const [showDirection, setShowDirection] = useState(true)
  const toggleShowDirection = useCallback((): void => {
    setShowDirection((v) => !v)
  }, [])

  // FR-28: 既定で有効。ペン先の太さが未入力の間はボタンを無効化し、実際には効果を持たない
  const [showActualWidth, setShowActualWidth] = useState(true)
  const toggleShowActualWidth = useCallback((): void => {
    setShowActualWidth((v) => !v)
  }, [])

  const view = useMemo(
    () => computeView(viewSize.width, viewSize.height, bedWidthMm, bedHeightMm),
    [viewSize, bedWidthMm, bedHeightMm],
  )
  const lineWidthPx =
    showActualWidth && penWidthMm > 0
      ? penWidthMm * view.scale
      : STROKE_LINE_WIDTH_PX
  // ペン先の太さが入力されている間は、Phase7(ペン分割)前の単一ペン前提として
  // SVG本来の色(FR-26)ではなく黒で統一する(実太さ表示のON/OFFに関わらず)。
  // 太さ未入力のままの場合は従来通りSVGの色で表示する
  const strokeColorOverride = penWidthMm > 0 ? '#000' : undefined

  // ベースレイヤー(stepに依存しない静的レイヤー)
  useEffect(() => {
    const canvas = canvasBaseRef.current
    if (!canvas || view.width === 0 || view.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    resetCanvas(canvas, ctx, view)

    ctx.fillStyle = BED_FILL_COLOR
    ctx.fillRect(
      view.offsetX,
      view.offsetY,
      view.boundsWidth * view.scale,
      view.boundsHeight * view.scale,
    )

    const defaultColor = getComputedStyle(canvas).color || '#000'
    defaultColorRef.current = defaultColor
    const projector = createProjector(view)

    ctx.save()
    ctx.globalAlpha = GHOST_ALPHA
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const segment of segments) {
      drawSegmentStroke(
        ctx,
        segment,
        projector,
        defaultColor,
        lineWidthPx,
        strokeColorOverride,
      )
    }
    ctx.restore()
  }, [segments, view, lineWidthPx, strokeColorOverride])

  // アクティブレイヤー: 直前の描画からsegments/viewが変わらず可視本数が増えただけの場合
  // (次へ/再生)は新規区間だけを追記描画し、それ以外(戻す/再読込/リサイズ)は描き直す
  useEffect(() => {
    const canvas = canvasActiveRef.current
    if (!canvas || view.width === 0 || view.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const canAppend =
      lastSegmentsRef.current === segments &&
      lastViewRef.current === view &&
      lastLineWidthPxRef.current === lineWidthPx &&
      visibleSegmentCount >= renderedCountRef.current

    if (!canAppend) {
      resetCanvas(canvas, ctx, view)
      renderedCountRef.current = 0
    }

    const start = renderedCountRef.current
    if (start < visibleSegmentCount) {
      const projector = createProjector(view)
      const defaultColor = defaultColorRef.current

      drawPenLifts(
        ctx,
        segments,
        Math.max(0, start - 1),
        visibleSegmentCount,
        projector,
      )

      // FR-26: 実際の色で描画
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (let i = start; i < visibleSegmentCount; i++) {
        drawSegmentStroke(
          ctx,
          segments[i],
          projector,
          defaultColor,
          lineWidthPx,
          strokeColorOverride,
        )
      }
    }

    renderedCountRef.current = visibleSegmentCount
    lastSegmentsRef.current = segments
    lastViewRef.current = view
    lastLineWidthPxRef.current = lineWidthPx
  }, [segments, visibleSegmentCount, view, lineWidthPx, strokeColorOverride])

  // マーカーレイヤー(FR-24): 開始点◯・方向矢印は常に固定色・固定線幅で描き、
  // アクティブレイヤー(実太さ表示中は太くなりうるインク)より上に独立したCanvasとして重ねることで、
  // 描画順に関わらず常にインクの上に見えるようにする。追記描画の方針はアクティブレイヤーと同じ
  useEffect(() => {
    const canvas = canvasMarkersRef.current
    if (!canvas || view.width === 0 || view.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const canAppend =
      lastMarkerSegmentsRef.current === segments &&
      lastMarkerViewRef.current === view &&
      lastMarkerShowDirectionRef.current === showDirection &&
      visibleSegmentCount >= renderedMarkerCountRef.current

    if (!canAppend) {
      resetCanvas(canvas, ctx, view)
      renderedMarkerCountRef.current = 0
    }

    const start = renderedMarkerCountRef.current
    if (showDirection && start < visibleSegmentCount) {
      const projector = createProjector(view)
      for (let i = start; i < visibleSegmentCount; i++) {
        const segment = segments[i]
        if (segment.points.length < 2) continue
        const p0 = segment.points[0]
        const startPoint = { x: projector.toX(p0), y: projector.toY(p0) }
        drawSegmentDirection(ctx, segment, startPoint, projector)
      }
    }

    renderedMarkerCountRef.current = visibleSegmentCount
    lastMarkerSegmentsRef.current = segments
    lastMarkerViewRef.current = view
    lastMarkerShowDirectionRef.current = showDirection
  }, [segments, visibleSegmentCount, view, showDirection])

  // ハイライトレイヤー(FR-43): ステップ位置に依存させず未描画のストロークも強調し、
  // リスト行から位置を辿れるようにする。独立したCanvasに分けることで、
  // アクティブレイヤーの差分追記描画を壊さずに毎回消去できる
  useEffect(() => {
    const canvas = canvasHighlightRef.current
    if (!canvas || view.width === 0 || view.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    resetCanvas(canvas, ctx, view)
    if (!hoverHighlight && !selectedHighlight) return

    const projector = createProjector(view)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // 選択とホバーが別の行を指している場合は両方を表示し、同じ行ならホバー色を上に重ねる
    drawHighlightRange(
      ctx,
      segments,
      selectedHighlight,
      SELECTED_HIGHLIGHT_COLOR,
      projector,
      lineWidthPx,
    )
    drawHighlightRange(
      ctx,
      segments,
      hoverHighlight,
      HOVER_HIGHLIGHT_COLOR,
      projector,
      lineWidthPx,
    )
  }, [segments, view, hoverHighlight, selectedHighlight, lineWidthPx])

  // FR-43(プレビュー→リスト方向): ヒット判定は毎mousemoveでなくrAFでコアレスする
  // (数万セグメントのファイルで距離計算が重いため)
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null)
  const hoverRafRef = useRef(0)

  useEffect(
    () => () => {
      if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current)
    },
    [],
  )

  const runHoverHitTest = useCallback((): void => {
    hoverRafRef.current = 0
    const pending = pendingMoveRef.current
    if (!pending || view.scale === 0) return
    const point = screenToMm(view, pending.x, pending.y)
    const thresholdMm = HIT_TEST_THRESHOLD_PX / view.scale
    onSegmentHover(findSegmentAtPoint(segments, point, thresholdMm))
  }, [segments, view, onSegmentHover])

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      pendingMoveRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
      if (!hoverRafRef.current) {
        hoverRafRef.current = requestAnimationFrame(runHoverHitTest)
      }
    },
    [runHoverHitTest],
  )

  const handleMouseLeave = useCallback((): void => {
    pendingMoveRef.current = null
    onSegmentHover(null)
  }, [onSegmentHover])

  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || view.scale === 0) return
      const point = screenToMm(
        view,
        e.clientX - rect.left,
        e.clientY - rect.top,
      )
      const thresholdMm = HIT_TEST_THRESHOLD_PX / view.scale
      const index = findSegmentAtPoint(segments, point, thresholdMm)
      if (index !== null) onSegmentSelect(index)
    },
    [segments, view, onSegmentSelect],
  )

  return (
    <section className="panel panel-preview">
      <PreviewHeader
        fileName={fileName}
        strokeCount={strokeCount}
        fillCount={fillCount}
        fillStrokeCount={fillStrokeCount}
        joinApplied={joinApplied}
        optimizeApplied={optimizeApplied}
        step={step}
        totalSteps={totalSteps}
        playing={playing}
        onStep={onStep}
        onTogglePlaying={onTogglePlaying}
        showDirection={showDirection}
        onToggleShowDirection={toggleShowDirection}
        showActualWidth={showActualWidth}
        onToggleShowActualWidth={toggleShowActualWidth}
        penWidthMm={penWidthMm}
      />
      <div
        className="panel-body panel-body-canvas"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <canvas ref={canvasBaseRef} className="preview-canvas" />
        <canvas ref={canvasActiveRef} className="preview-canvas" />
        <canvas ref={canvasHighlightRef} className="preview-canvas" />
        <canvas ref={canvasMarkersRef} className="preview-canvas" />
      </div>
    </section>
  )
}

export const PreviewPanel = memo(PreviewPanelImpl)
