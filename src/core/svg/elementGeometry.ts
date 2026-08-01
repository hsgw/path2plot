import type { PathCommand } from './types'
import { parsePathData } from './pathData'
import {
  circleToCommands,
  ellipseToCommands,
  lineToCommands,
  polylineToCommands,
  rectToCommands,
} from './shapes'

/** 対応する図形要素(FR-1)。これ以外の描画要素は未対応としてエラーにする */
export const SUPPORTED_SHAPE_TAGS = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
])

function getNumberAttr(el: Element, name: string, fallback: number): number {
  const v = el.getAttribute(name)
  if (v === null) return fallback
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * 図形要素1つを(未変換ローカル座標のままの)PathCommand列へ変換する。
 * 描画結果が空になる指定(幅0のrect、半径0のcircle等)は空配列を返す。
 * rect要素の角丸(rx/ry)はSPEC.mdに明記がないため未対応(直角のみ)。
 */
export function commandsForElement(tag: string, el: Element): PathCommand[] {
  switch (tag) {
    case 'path': {
      const d = el.getAttribute('d')
      return d ? parsePathData(d) : []
    }
    case 'rect': {
      const width = getNumberAttr(el, 'width', 0)
      const height = getNumberAttr(el, 'height', 0)
      if (width <= 0 || height <= 0) return []
      return rectToCommands(
        getNumberAttr(el, 'x', 0),
        getNumberAttr(el, 'y', 0),
        width,
        height,
      )
    }
    case 'circle': {
      const r = getNumberAttr(el, 'r', 0)
      if (r <= 0) return []
      return circleToCommands(
        getNumberAttr(el, 'cx', 0),
        getNumberAttr(el, 'cy', 0),
        r,
      )
    }
    case 'ellipse': {
      const rx = getNumberAttr(el, 'rx', 0)
      const ry = getNumberAttr(el, 'ry', 0)
      if (rx <= 0 || ry <= 0) return []
      return ellipseToCommands(
        getNumberAttr(el, 'cx', 0),
        getNumberAttr(el, 'cy', 0),
        rx,
        ry,
      )
    }
    case 'line':
      return lineToCommands(
        getNumberAttr(el, 'x1', 0),
        getNumberAttr(el, 'y1', 0),
        getNumberAttr(el, 'x2', 0),
        getNumberAttr(el, 'y2', 0),
      )
    case 'polyline': {
      const points = el.getAttribute('points')
      return points ? polylineToCommands(points, false) : []
    }
    case 'polygon': {
      const points = el.getAttribute('points')
      return points ? polylineToCommands(points, true) : []
    }
    default:
      return []
  }
}
