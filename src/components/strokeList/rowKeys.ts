import type { HighlightSelection } from '../../core/plan/types'

/**
 * FR-43のハイライト行キー。行の種別ごとに接頭辞を付け、同じidを持つ行
 * (block行とその先頭ストローク行など)が衝突しないようにする
 */
export const strokeRowKey = (id: string): string => `stroke:${id}`
export const blockRowKey = (id: string): string => `block:${id}`
export const fillRowKey = (id: string): string => `fill:${id}`
export const fillChildRowKey = (id: string, segmentOffset: number): string =>
  `fillchild:${id}:${segmentOffset}`

/**
 * FR-43: イベント委譲で、ホバー/クリック/右クリックされた位置から対象行のハイライト情報を読み取る。
 * 各行がdata-hl-*属性として持つ情報(プレビューのどのセグメントに対応するか)を復元する。
 * 行ごとにハンドラを持たせると、数万行のリストでクロージャ生成コストが無視できなくなるため、
 * リスト全体で1組のハンドラだけを使う
 */
export function findHighlightTarget(
  target: EventTarget | null,
): HighlightSelection | null {
  if (!(target instanceof Element)) return null
  const row = target.closest<HTMLElement>('[data-hl-key]')
  if (!row) return null
  const { hlKey, hlIndex, hlCount, hlOffset } = row.dataset
  if (hlKey === undefined || hlIndex === undefined || hlCount === undefined) {
    return null
  }
  return {
    key: hlKey,
    entryIndex: Number(hlIndex),
    entryCount: Number(hlCount),
    segmentOffset: hlOffset === undefined ? undefined : Number(hlOffset),
  }
}
