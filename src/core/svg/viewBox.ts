import type { ViewBox } from '../geometry/types'

function parseLength(value: string | null): number | undefined {
  if (!value) return undefined
  const m = /^[-+]?[\d.]+/.exec(value.trim())
  return m ? Number(m[0]) : undefined
}

/** svg要素のviewBoxを読む。未指定ならwidth/height属性(それも無ければ100)から組み立てる */
export function parseViewBox(svgEl: Element): ViewBox {
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
