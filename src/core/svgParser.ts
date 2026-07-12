import type { Matrix2D, ViewBox } from '../types/geometry'
import type {
  ParseSettings,
  ParsedStroke,
  SvgParseError,
  SvgParseResult,
} from '../types/svg'
import {
  computeStrokeFillState,
  hasVisibleStrokeOrFill,
  isDisplayNone,
  parseStyleDeclarations,
  resolveDisplayColor,
  type StrokeFillState,
} from './colorResolve'
import {
  computeScaleMmPerUnit,
  svgToPrinterMatrix,
} from './coordinateTransform'
import { multiply } from './matrix'
import type { PathCommand } from './pathCommand'
import { parsePathData } from './pathData'
import { pathCommandsToPolylines, transformPathCommands } from './pathGeometry'
import {
  circleToCommands,
  ellipseToCommands,
  lineToCommands,
  polylineToCommands,
  rectToCommands,
} from './shapes'
import { parseTransformAttr } from './transformAttr'

const CONTAINER_TAGS = new Set(['g'])
const IGNORED_TAGS = new Set(['defs', 'metadata', 'style', 'title', 'desc'])
const DEFINITION_TAGS = new Set([
  'clipPath',
  'mask',
  'filter',
  'linearGradient',
  'radialGradient',
  'pattern',
])
const UNSUPPORTED_ALWAYS_TAGS = new Set(['image', 'text', 'use'])
const SUPPORTED_SHAPE_TAGS = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
])

const REFERENCE_PROPS = ['fill', 'stroke', 'clip-path', 'mask', 'filter']
const URL_REF_RE = /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/

interface WalkCtx {
  matrix: Matrix2D
  strokeFillState: StrokeFillState | null
}

function getNumberAttr(el: Element, name: string, fallback: number): number {
  const v = el.getAttribute(name)
  if (v === null) return fallback
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

function commandsForElement(tag: string, el: Element): PathCommand[] {
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

function getEffectivePresentationValue(
  el: Element,
  styleMap: Map<string, string>,
  name: string,
): string | undefined {
  return styleMap.get(name) ?? el.getAttribute(name) ?? undefined
}

function findUnsupportedReference(
  el: Element,
  styleMap: Map<string, string>,
  registry: Map<string, string>,
): { prop: string; id: string; refTag: string } | null {
  for (const prop of REFERENCE_PROPS) {
    const value = getEffectivePresentationValue(el, styleMap, prop)
    if (!value) continue
    const m = URL_REF_RE.exec(value)
    if (m && registry.has(m[1])) {
      return { prop, id: m[1], refTag: registry.get(m[1])! }
    }
  }
  return null
}

function buildDefinitionRegistry(doc: Document): Map<string, string> {
  const registry = new Map<string, string>()
  const all = doc.getElementsByTagName('*')
  for (let i = 0; i < all.length; i++) {
    const el = all[i]
    if (DEFINITION_TAGS.has(el.tagName)) {
      const id = el.getAttribute('id')
      if (id) registry.set(id, el.tagName)
    }
  }
  return registry
}

function parseLength(value: string | null): number | undefined {
  if (!value) return undefined
  const m = /^[-+]?[\d.]+/.exec(value.trim())
  return m ? Number(m[0]) : undefined
}

function parseViewBox(svgEl: Element): ViewBox {
  const vb = svgEl.getAttribute('viewBox')
  if (vb) {
    const nums = vb
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) {
      const [minX, minY, width, height] = nums
      return { minX, minY, width, height }
    }
  }
  const width = parseLength(svgEl.getAttribute('width')) ?? 100
  const height = parseLength(svgEl.getAttribute('height')) ?? 100
  return { minX: 0, minY: 0, width, height }
}

function extractLineColumn(message: string): {
  line?: number
  column?: number
} {
  const lineMatch = /line[^\d]{0,15}(\d+)/i.exec(message)
  const columnMatch = /column[^\d]{0,15}(\d+)/i.exec(message)
  return {
    line: lineMatch ? Number(lineMatch[1]) : undefined,
    column: columnMatch ? Number(columnMatch[1]) : undefined,
  }
}

function walk(
  el: Element,
  ctx: WalkCtx,
  registry: Map<string, string>,
  counter: { value: number },
  toleranceMm: number,
  strokes: ParsedStroke[],
  errors: SvgParseError[],
): void {
  const tag = el.tagName
  const index = counter.value++

  if (isDisplayNone(el)) return
  if (IGNORED_TAGS.has(tag)) return
  if (DEFINITION_TAGS.has(tag)) return

  const elementId = el.getAttribute('id') ?? undefined

  if (UNSUPPORTED_ALWAYS_TAGS.has(tag)) {
    errors.push({
      kind: 'unsupported-element',
      message: `未対応の要素です: <${tag}>`,
      elementTag: tag,
      elementId,
      elementIndex: index,
    })
    return
  }

  const styleMap = parseStyleDeclarations(el.getAttribute('style'))
  const strokeFillState = computeStrokeFillState(el, ctx.strokeFillState)
  const localMatrix = parseTransformAttr(el.getAttribute('transform'))
  const matrix = multiply(ctx.matrix, localMatrix)

  const reference = findUnsupportedReference(el, styleMap, registry)
  if (reference) {
    errors.push({
      kind: 'unsupported-element',
      message: `未対応の要素を参照しています: ${reference.prop}="url(#${reference.id})" (<${reference.refTag}>への参照)`,
      elementTag: tag,
      elementId,
      elementIndex: index,
    })
    if (!CONTAINER_TAGS.has(tag)) return
  }

  if (CONTAINER_TAGS.has(tag)) {
    for (const child of Array.from(el.children)) {
      walk(
        child,
        { matrix, strokeFillState },
        registry,
        counter,
        toleranceMm,
        strokes,
        errors,
      )
    }
    return
  }

  if (!SUPPORTED_SHAPE_TAGS.has(tag)) {
    errors.push({
      kind: 'unsupported-element',
      message: `未対応の要素です: <${tag}>`,
      elementTag: tag,
      elementId,
      elementIndex: index,
    })
    return
  }

  if (!strokeFillState.visible) return
  if (!hasVisibleStrokeOrFill(strokeFillState)) return

  const localCommands = commandsForElement(tag, el)
  if (localCommands.length === 0) return

  const transformed = transformPathCommands(localCommands, matrix)
  const polylines = pathCommandsToPolylines(transformed, toleranceMm)
  const color = resolveDisplayColor(strokeFillState)

  for (const points of polylines) {
    if (points.length < 2) continue
    strokes.push({
      id: `stroke-${strokes.length}`,
      sourceId: elementId,
      points,
      color,
    })
  }
}

/** SVGファイルの文字列を解析し、プリンタ座標系(mm)のストローク一覧とエラー一覧を返す */
export function parseSvgFile(
  svgText: string,
  settings: ParseSettings,
): SvgParseResult {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')

  const parserErrorEl = doc.getElementsByTagName('parsererror')[0]
  if (parserErrorEl) {
    const message = parserErrorEl.textContent ?? 'SVGの解析に失敗しました'
    const { line, column } = extractLineColumn(message)
    return {
      strokes: [],
      errors: [{ kind: 'parse-error', message: message.trim(), line, column }],
      viewBox: { minX: 0, minY: 0, width: 0, height: 0 },
    }
  }

  const svgEl = doc.documentElement
  const viewBox = parseViewBox(svgEl)
  const scale = computeScaleMmPerUnit(settings.dpi, settings.scaleFactor)
  const printerMatrix = svgToPrinterMatrix(viewBox, scale)

  const registry = buildDefinitionRegistry(doc)
  const counter = { value: 0 }
  const strokes: ParsedStroke[] = []
  const errors: SvgParseError[] = []

  for (const child of Array.from(svgEl.children)) {
    walk(
      child,
      { matrix: printerMatrix, strokeFillState: null },
      registry,
      counter,
      settings.bezierToleranceMm,
      strokes,
      errors,
    )
  }

  return { strokes, errors, viewBox }
}
