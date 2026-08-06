import type { Matrix2D } from '../geometry/types'
import { multiply, translate } from '../geometry/matrix'
import type { FillCandidate } from '../fill/types'
import type {
  ParseSettings,
  ParsedStroke,
  StrokeFillState,
  SvgParseError,
  SvgParseResult,
} from './types'
import { commandsForElement, SUPPORTED_SHAPE_TAGS } from './elementGeometry'
import {
  buildDefinitionRegistry,
  DEFINITION_TAGS,
  findUnsupportedReference,
  type DefinitionRegistry,
} from './references'
import {
  computeStrokeFillState,
  hasVisibleStrokeOrFill,
  isDisplayNone,
  isFillVisible,
  isStrokeVisible,
  parseStyleDeclarations,
} from './styleResolve'
import {
  computeScaleMmPerUnit,
  svgToPrinterMatrix,
} from './coordinateTransform'
import { pathCommandsToPolylines, transformPathCommands } from './polyline'
import { parseTransformAttr } from './transformAttr'
import { parseViewBox } from './viewBox'

const CONTAINER_TAGS = new Set(['g'])
const IGNORED_TAGS = new Set(['defs', 'metadata', 'style', 'title', 'desc'])
const UNSUPPORTED_ALWAYS_TAGS = new Set(['image', 'text', 'use'])

/** 親要素から引き継ぐ状態 */
interface InheritedState {
  matrix: Matrix2D
  strokeFillState: StrokeFillState | null
}

/** 走査全体で共有する入力と、走査しながら書き込む出力の置き場 */
interface WalkContext {
  registry: DefinitionRegistry
  toleranceMm: number
  /** エラー表示で要素を特定するための、SVG文書全体での出現順 */
  counter: { value: number }
  strokes: ParsedStroke[]
  fillCandidates: FillCandidate[]
  errors: SvgParseError[]
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

/**
 * FR-16: stroke/fillは独立に判定する(両方可視な要素は輪郭のストロークと塗りの両方を生成する)。
 * strokeが可視な要素は全subpath(開・閉とも)をストロークとして描画する。
 * fillが可視な要素は、閉subpathのみFillCandidate(塗りブロック)化する
 * (開いたsubpathはFR-16の閉パス自動検出の対象外のため、fill専用ではドロップする)
 */
function emitShape(
  el: Element,
  tag: string,
  elementId: string | undefined,
  state: StrokeFillState,
  matrix: Matrix2D,
  ctx: WalkContext,
): void {
  const localCommands = commandsForElement(tag, el)
  if (localCommands.length === 0) return

  const transformed = transformPathCommands(localCommands, matrix)
  const polylines = pathCommandsToPolylines(transformed, ctx.toleranceMm)

  if (isStrokeVisible(state)) {
    for (const { points } of polylines) {
      if (points.length < 2) continue
      ctx.strokes.push({
        id: `stroke-${ctx.strokes.length}`,
        sourceId: elementId,
        points,
        color: state.stroke,
      })
    }
  }
  if (isFillVisible(state)) {
    const closedContours = polylines
      .filter((p) => p.closed && p.points.length >= 2)
      .map((p) => p.points)
    if (closedContours.length > 0) {
      ctx.fillCandidates.push({
        id: `fill-${ctx.fillCandidates.length}`,
        sourceId: elementId,
        fillColor: state.fill,
        fillRule: state.fillRule,
        contours: closedContours,
      })
    }
  }
}

function walk(el: Element, inherited: InheritedState, ctx: WalkContext): void {
  const tag = el.tagName
  const index = ctx.counter.value++

  if (isDisplayNone(el)) return
  if (IGNORED_TAGS.has(tag)) return
  if (DEFINITION_TAGS.has(tag)) return

  const elementId = el.getAttribute('id') ?? undefined
  const pushUnsupported = (message: string): void => {
    ctx.errors.push({
      kind: 'unsupported-element',
      message,
      elementTag: tag,
      elementId,
      elementIndex: index,
    })
  }

  if (UNSUPPORTED_ALWAYS_TAGS.has(tag)) {
    pushUnsupported(`未対応の要素です: <${tag}>`)
    return
  }

  const styleMap = parseStyleDeclarations(el.getAttribute('style'))
  const strokeFillState = computeStrokeFillState(el, inherited.strokeFillState)
  const localMatrix = parseTransformAttr(el.getAttribute('transform'))
  const matrix = multiply(inherited.matrix, localMatrix)

  const reference = findUnsupportedReference(el, styleMap, ctx.registry)
  if (reference) {
    pushUnsupported(
      `未対応の要素を参照しています: ${reference.prop}="url(#${reference.id})" (<${reference.refTag}>への参照)`,
    )
    if (!CONTAINER_TAGS.has(tag)) return
  }

  if (CONTAINER_TAGS.has(tag)) {
    for (const child of Array.from(el.children)) {
      walk(child, { matrix, strokeFillState }, ctx)
    }
    return
  }

  if (!SUPPORTED_SHAPE_TAGS.has(tag)) {
    pushUnsupported(`未対応の要素です: <${tag}>`)
    return
  }

  // FR-5: stroke/fillともに不可視(none・透明・幅0)な要素は描画対象にしない
  if (!strokeFillState.visible) return
  if (!hasVisibleStrokeOrFill(strokeFillState)) return

  emitShape(el, tag, elementId, strokeFillState, matrix, ctx)
}

/** SVGファイルの文字列を解析し、プリンタ座標系(mm)のストローク一覧・塗り候補・エラー一覧を返す */
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
      fillCandidates: [],
      errors: [{ kind: 'parse-error', message: message.trim(), line, column }],
      viewBox: { minX: 0, minY: 0, width: 0, height: 0 },
    }
  }

  const svgEl = doc.documentElement
  const viewBox = parseViewBox(svgEl)
  const scale = computeScaleMmPerUnit(settings.dpi, settings.scaleFactor)
  const printerMatrix = multiply(
    translate(settings.offsetXMm, settings.offsetYMm),
    svgToPrinterMatrix(viewBox, scale),
  )

  const ctx: WalkContext = {
    registry: buildDefinitionRegistry(doc),
    toleranceMm: settings.bezierToleranceMm,
    counter: { value: 0 },
    strokes: [],
    fillCandidates: [],
    errors: [],
  }

  for (const child of Array.from(svgEl.children)) {
    walk(child, { matrix: printerMatrix, strokeFillState: null }, ctx)
  }

  return {
    strokes: ctx.strokes,
    fillCandidates: ctx.fillCandidates,
    errors: ctx.errors,
    viewBox,
  }
}
