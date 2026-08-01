import type { FillSettings } from '../types/fill'

/** ストローク並び順リストのfill行に出す、塗りつぶし方式の短い表記 */
export function describeFillPattern(settings: FillSettings): string {
  if (settings.pattern === 'concentric') return '同心'
  if (settings.pattern === 'spiral') return 'スパイラル'

  const base = settings.crossHatch ? 'クロスハッチ' : 'ハッチ'
  const connect =
    settings.connect === 'zigzag'
      ? 'ジグザグ'
      : settings.connect === 'boustrophedon'
        ? '往復'
        : null
  return connect ? `${base}/${connect}` : base
}
