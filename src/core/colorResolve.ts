export interface StrokeFillState {
  stroke: string
  fill: string
  strokeWidth: number
  strokeOpacity: number
  fillOpacity: number
  visible: boolean
}

export function parseStyleDeclarations(
  style: string | null,
): Map<string, string> {
  const map = new Map<string, string>()
  if (!style) return map
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const key = decl.slice(0, idx).trim()
    const value = decl.slice(idx + 1).trim()
    if (key) map.set(key, value)
  }
  return map
}

function getPresentationValue(
  el: Element,
  styleMap: Map<string, string>,
  name: string,
): string | undefined {
  return styleMap.get(name) ?? el.getAttribute(name) ?? undefined
}

function isNoneOrTransparent(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v === 'none' || v === 'transparent') return true
  const rgbaMatch = v.match(/^rgba?\(([^)]+)\)$/)
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((s) => s.trim())
    if (parts.length === 4 && Number(parts[3]) === 0) return true
  }
  return false
}

/** display:none指定(styleまたは属性)を判定する。displayはCSS上は非継承だが祖先の指定はサブツリー全体を無効化する */
export function isDisplayNone(el: Element): boolean {
  const styleMap = parseStyleDeclarations(el.getAttribute('style'))
  return getPresentationValue(el, styleMap, 'display') === 'none'
}

/** 親から継承したstroke/fill状態と自身の指定をマージする(FR-1のインラインstyle・属性・継承を評価対象とする方針) */
export function computeStrokeFillState(
  el: Element,
  parent: StrokeFillState | null,
): StrokeFillState {
  const styleMap = parseStyleDeclarations(el.getAttribute('style'))

  const strokeRaw = getPresentationValue(el, styleMap, 'stroke')
  const fillRaw = getPresentationValue(el, styleMap, 'fill')
  const strokeWidthRaw = getPresentationValue(el, styleMap, 'stroke-width')
  const strokeOpacityRaw = getPresentationValue(el, styleMap, 'stroke-opacity')
  const fillOpacityRaw = getPresentationValue(el, styleMap, 'fill-opacity')
  const visibilityRaw = getPresentationValue(el, styleMap, 'visibility')

  const stroke = strokeRaw ?? parent?.stroke ?? 'none'
  const fill = fillRaw ?? parent?.fill ?? '#000000'
  const strokeWidth =
    strokeWidthRaw !== undefined
      ? parseFloat(strokeWidthRaw)
      : (parent?.strokeWidth ?? 1)
  const strokeOpacity =
    strokeOpacityRaw !== undefined
      ? parseFloat(strokeOpacityRaw)
      : (parent?.strokeOpacity ?? 1)
  const fillOpacity =
    fillOpacityRaw !== undefined
      ? parseFloat(fillOpacityRaw)
      : (parent?.fillOpacity ?? 1)

  let visible = parent?.visible ?? true
  if (visibilityRaw === 'hidden' || visibilityRaw === 'collapse')
    visible = false
  else if (visibilityRaw === 'visible') visible = true

  return { stroke, fill, strokeWidth, strokeOpacity, fillOpacity, visible }
}

/** FR-5: stroke/fillともに不可視(none・透明・幅0)な要素かどうか */
export function hasVisibleStrokeOrFill(state: StrokeFillState): boolean {
  const strokeVisible =
    !isNoneOrTransparent(state.stroke) &&
    state.strokeWidth !== 0 &&
    state.strokeOpacity !== 0
  const fillVisible =
    !isNoneOrTransparent(state.fill) && state.fillOpacity !== 0
  return strokeVisible || fillVisible
}
