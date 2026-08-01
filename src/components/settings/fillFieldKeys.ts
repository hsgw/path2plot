import type { FillSettings } from '../../core/fill/types'

/**
 * 現在の設定で実際に表示されている数値入力欄のキー。
 * useInvalidFields.retainOnlyに渡し、条件表示で隠れた欄の不正値が残り続けて
 * G-codeダウンロードが解除されなくなるのを防ぐ。
 */
export function visibleNumberFieldKeys(settings: FillSettings): Set<string> {
  if (!settings.enabled) return new Set()
  const keys = ['spacingMm', 'contourOffsetMm']
  if (settings.pattern === 'hatch') {
    keys.push('angleDeg')
    if (settings.crossHatch) keys.push('crossAngleDeg')
    if (settings.connect === 'boustrophedon') keys.push('connectDistanceFactor')
    // ジグザグは行の端点しか使わないため波形は結果に現れず、欄自体を出さない
    if (settings.connect !== 'zigzag' && settings.waveform !== 'straight') {
      keys.push('waveAmplitudeMm', 'waveLengthMm')
      if (settings.waveform === 'sine') keys.push('waveSegmentsPerCycle')
    }
  }
  return new Set(keys)
}
