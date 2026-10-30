import { type RefObject, useEffect, useLayoutEffect } from 'react'

/**
 * 右クリックメニュー・個別編集ポップオーバーで共通の「画面内へクランプして表示位置を確定し、
 * メニュー外クリック・Escape・リサイズ・スクロールで閉じる」振る舞い。
 * StrokeContextMenuのFR-14実装から切り出し、FillOverridePopoverと共有する
 */
export function useFloatingPanelDismiss(
  ref: RefObject<HTMLElement | null>,
  anchor: { x: number; y: number },
  onClose: () => void,
): void {
  // 画面外へはみ出さないよう、実寸を測ってから位置を確定する(ペイント前に確定させたいのでlayout effect)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const x = Math.max(4, Math.min(anchor.x, window.innerWidth - width - 4))
    const y = Math.max(4, Math.min(anchor.y, window.innerHeight - height - 4))
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [anchor.x, anchor.y, ref])

  // 外側のクリック・スクロール・リサイズ・Escapeで閉じる。開いた操作のpointerdownは
  // contextmenu/clickより前に発火済みのため、この購読で即座に閉じてしまうことはない
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent): void => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return
      onClose()
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose, ref])
}
