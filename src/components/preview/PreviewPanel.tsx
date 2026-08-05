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
  HIGHLIGHT_LINE_WIDTH,
  HOVER_HIGHLIGHT_COLOR,
  SELECTED_HIGHLIGHT_COLOR,
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
 * プレビュー列。描画は3枚のCanvasを重ねて分担する(ステップ操作のたびに全体を描き直すと
 * 大規模SVGで数百msかかるため):
 *  - ベース: ベッドの白塗り+全セグメントのゴースト表示(stepに依存しない)
 *  - アクティブ: 実色の描画+開始点◯+方向矢印+ペンアップ移動(stepに追従、進む方向は追記のみ)
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
  const viewSize = useContainerSize(containerRef)

  // ベースレイヤーで解決した既定色と、アクティブレイヤーの差分描画状態をレイヤー間で共有するref
  const defaultColorRef = useRef('#000')
  const renderedCountRef = useRef(0)
  const lastSegmentsRef = useRef<PreviewSegment[] | null>(null)
  const lastViewRef = useRef<View | null>(null)
  const lastShowDirectionRef = useRef(true)

  // FR-24の開始点◯・方向矢印の表示切り替え(既定は表示)
  const [showDirection, setShowDirection] = useState(true)
  const toggleShowDirection = useCallback((): void => {
    setShowDirection((v) => !v)
  }, [])

  const view = useMemo(
    () => computeView(viewSize.width, viewSize.height, bedWidthMm, bedHeightMm),
    [viewSize, bedWidthMm, bedHeightMm],
  )

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
      drawSegmentStroke(ctx, segment, projector, defaultColor)
    }
    ctx.restore()
  }, [segments, view])

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
      lastShowDirectionRef.current === showDirection &&
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
        const segment = segments[i]
        const first = drawSegmentStroke(ctx, segment, projector, defaultColor)
        if (!first) continue
        if (showDirection) {
          drawSegmentDirection(ctx, segment, first, projector, defaultColor)
        }
      }
    }

    renderedCountRef.current = visibleSegmentCount
    lastSegmentsRef.current = segments
    lastViewRef.current = view
    lastShowDirectionRef.current = showDirection
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
    ctx.lineWidth = HIGHLIGHT_LINE_WIDTH
    // 選択とホバーが別の行を指している場合は両方を表示し、同じ行ならホバー色を上に重ねる
    drawHighlightRange(
      ctx,
      segments,
      selectedHighlight,
      SELECTED_HIGHLIGHT_COLOR,
      projector,
    )
    drawHighlightRange(
      ctx,
      segments,
      hoverHighlight,
      HOVER_HIGHLIGHT_COLOR,
      projector,
    )
  }, [segments, view, hoverHighlight, selectedHighlight])

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
      </div>
    </section>
  )
}

export const PreviewPanel = memo(PreviewPanelImpl)
