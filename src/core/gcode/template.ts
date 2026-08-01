/**
 * テンプレートgcode中の{x} {y} {z} {f}等の変数を展開する(FR-32)。
 * varsに存在しないプレースホルダはそのまま残す(未定義変数を誤って空文字に落とさないため)。
 */
export function renderGcodeTemplate(
  template: string,
  vars: Record<string, number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (key in vars) return String(vars[key])
    return match
  })
}
