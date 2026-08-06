import type { Point } from '../geometry/types'
import type { DrawGroup, GcodeSettings } from './types'
import { renderGcodeTemplate } from './template'
import { filterMinSegmentLength } from './segmentFilter'

/** 数値を小数点以下3桁までに丸めてG-codeの座標・速度値として整形する */
function fmt(n: number): string {
  return Number(n.toFixed(3)).toString()
}

/**
 * 描画可能領域のローカル座標(0,0起点、はみ出し判定FR-38が使う空間)を、
 * G28 W後のファームウェア原点を基準とした機械絶対座標へ変換する(bedOriginXMm/YMm参照)。
 * パーク位置(FR-30)は元々絶対座標として設定されているため、この変換の対象外。
 */
function toMachinePoint(p: Point, settings: GcodeSettings): Point {
  return {
    x: p.x + settings.bedOriginXMm,
    y: p.y + settings.bedOriginYMm,
  }
}

/**
 * テンプレート展開用の変数一式を作る(FR-32)。GcodeSettingsの数値項目(templatesを除く)を
 * キー名そのままの変数として全テンプレート共通で使えるようにする(テンプレート間で同名変数が
 * 異なる値を指すことを避けるため)。
 */
function buildTemplateVars(settings: GcodeSettings): Record<string, number> {
  const { templates: _templates, ...vars } = settings
  return vars
}

/**
 * 単一ペン前提(ペン分割なし)で、結合ブロック(FR-14)単位でG-codeを生成する(FR-29)。
 * 各グループは移動(travelMoveテンプレート)→ペンダウン(テンプレート)→描画(drawMoveテンプレート、
 * グループ内は結合されペンを上げない)→ペンアップ(テンプレート)の順で出力し、最小セグメント長
 * (FR-34)による間引きを行う。開始・終了ブロックもテンプレートから展開する(FR-30)。
 */
export function generateGcode(
  groups: DrawGroup[],
  settings: GcodeSettings,
): string {
  const lines: string[] = []
  const templateVars = buildTemplateVars(settings)

  lines.push(renderGcodeTemplate(settings.templates.start, templateVars))

  for (const group of groups) {
    const points = filterMinSegmentLength(group, settings.minSegmentLengthMm)
    if (points.length < 2) continue

    const [first, ...rest] = points
    const firstMachine = toMachinePoint(first, settings)
    lines.push(
      renderGcodeTemplate(settings.templates.travelMove, {
        ...templateVars,
        x: Number(fmt(firstMachine.x)),
        y: Number(fmt(firstMachine.y)),
      }),
    )
    lines.push(renderGcodeTemplate(settings.templates.penDown, templateVars))
    for (const p of rest) {
      const pMachine = toMachinePoint(p, settings)
      lines.push(
        renderGcodeTemplate(settings.templates.drawMove, {
          ...templateVars,
          x: Number(fmt(pMachine.x)),
          y: Number(fmt(pMachine.y)),
        }),
      )
    }
    lines.push(renderGcodeTemplate(settings.templates.penUp, templateVars))
  }

  lines.push(renderGcodeTemplate(settings.templates.end, templateVars))

  return lines.join('\n') + '\n'
}
