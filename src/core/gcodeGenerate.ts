import type { Point } from '../types/geometry'
import type { GcodeSettings } from '../types/gcode'
import type { ParsedStroke } from '../types/svg'
import { renderGcodeTemplate } from './gcodeTemplate'
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
 * 単一ペン前提(ペン分割なし)で、Phase 2のストローク順のままG-codeを生成する(FR-29)。
 * 各ストロークは移動(G00)→ペンダウン(テンプレート)→描画(G01)→ペンアップ(テンプレート)の順で出力し、
 * 最小セグメント長(FR-34)による間引きを行う。開始・終了ブロックはテンプレートから展開する(FR-30)。
 */
export function generateGcode(
  strokes: ParsedStroke[],
  settings: GcodeSettings,
): string {
  const lines: string[] = []

  lines.push(
    renderGcodeTemplate(settings.templates.start, { z: settings.travelZ }),
  )

  for (const stroke of strokes) {
    const points = filterMinSegmentLength(
      stroke.points,
      settings.minSegmentLengthMm,
    )
    if (points.length < 2) continue

    const [first, ...rest] = points
    const firstMachine = toMachinePoint(first, settings)
    lines.push(
      `G00 X${fmt(firstMachine.x)} Y${fmt(firstMachine.y)} F${fmt(settings.travelFeedRate)}`,
    )
    lines.push(
      renderGcodeTemplate(settings.templates.penDown, {
        z: settings.penDownZ,
        f: settings.penFeedRate,
      }),
    )
    for (const p of rest) {
      const pMachine = toMachinePoint(p, settings)
      lines.push(
        `G01 X${fmt(pMachine.x)} Y${fmt(pMachine.y)} F${fmt(settings.drawFeedRate)}`,
      )
    }
    lines.push(
      renderGcodeTemplate(settings.templates.penUp, {
        z: settings.penUpZ,
        f: settings.penFeedRate,
      }),
    )
  }

  lines.push(
    renderGcodeTemplate(settings.templates.end, {
      x: settings.parkX,
      y: settings.parkY,
      f: settings.travelFeedRate,
    }),
  )

  return lines.join('\n') + '\n'
}
