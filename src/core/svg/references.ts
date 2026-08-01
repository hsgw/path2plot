import { getPresentationValue } from './styleResolve'

/**
 * それ自体は描画されず、id参照されて初めて効果を持つ定義要素。
 * FR-36: 参照している要素があればその要素を未対応としてエラーにする
 */
export const DEFINITION_TAGS = new Set([
  'clipPath',
  'mask',
  'filter',
  'linearGradient',
  'radialGradient',
  'pattern',
])

const REFERENCE_PROPS = ['fill', 'stroke', 'clip-path', 'mask', 'filter']
const URL_REF_RE = /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/

/** id → 定義要素のタグ名。未参照の定義要素はエラーにしないため、参照側から引くこの向きで持つ */
export type DefinitionRegistry = Map<string, string>

export function buildDefinitionRegistry(doc: Document): DefinitionRegistry {
  const registry: DefinitionRegistry = new Map()
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

export interface UnsupportedReference {
  prop: string
  id: string
  refTag: string
}

/** 要素が定義要素(グラデーション・clipPath等)をurl(#id)で参照していれば、その最初の1件を返す */
export function findUnsupportedReference(
  el: Element,
  styleMap: Map<string, string>,
  registry: DefinitionRegistry,
): UnsupportedReference | null {
  for (const prop of REFERENCE_PROPS) {
    const value = getPresentationValue(el, styleMap, prop)
    if (!value) continue
    const m = URL_REF_RE.exec(value)
    if (m && registry.has(m[1])) {
      return { prop, id: m[1], refTag: registry.get(m[1])! }
    }
  }
  return null
}
