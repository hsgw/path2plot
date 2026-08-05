import type { FillSettings } from './types'

/** ストローク並び順リストのfill行に出す、塗りつぶし方式の短い表記 */
export function describeFillPattern(settings: FillSettings): string {
  if (settings.pattern === 'offset') {
    return settings.offsetSpiralMode ? 'スパイラル' : '同心'
  }

  const base = settings.crossHatch ? 'クロスハッチ' : 'ハッチ'
  const connect =
    settings.connect === 'zigzag'
      ? 'ジグザグ'
      : settings.connect === 'boustrophedon'
        ? '往復'
        : null
  return connect ? `${base}/${connect}` : base
}
