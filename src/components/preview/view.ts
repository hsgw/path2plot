import type { Point } from '../../core/geometry/types'

/** プレビューCanvasの表示状態(想定描画可能領域をコンテナへフィットさせた結果) */
export interface View {
  dpr: number
  width: number
  height: number
  boundsWidth: number
  boundsHeight: number
  scale: number
  offsetX: number
  offsetY: number
}

const PADDING_PX = 20

/**
 * ビュー(白い用紙枠の位置・大きさ)は描画可能領域の設定(FR-35)とコンテナのサイズだけで決まり、
 * DPI/倍率設定やSVGの内容には依存しない。設定変更でプレビュー上のサイズが変化して見えるようにするため。
 */
export function computeView(
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

/**
 * mm座標→画面座標(px)の射影。Point配列の中間確保(.map)を避けるため、
 * x/yを別々の関数として返す(点数が数十万になるとGCコストが無視できない)
 */
export interface Projector {
  toX: (p: Point) => number
  toY: (p: Point) => number
}

export function createProjector(view: View): Projector {
  return {
    toX: (p) => view.offsetX + p.x * view.scale,
    // プリンタ座標は原点左下・Y上向きなので、画面座標へは上下反転して写す
    toY: (p) => view.height - (view.offsetY + p.y * view.scale),
  }
}

/** Canvasの実ピクセル数をdprに合わせて設定し、論理px単位で描けるようにする(内容はクリアされる) */
export function resetCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  view: View,
): void {
  canvas.width = view.width * view.dpr
  canvas.height = view.height * view.dpr
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
  ctx.clearRect(0, 0, view.width, view.height)
}
