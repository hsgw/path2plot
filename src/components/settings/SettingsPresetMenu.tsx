import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingPanelDismiss } from '../common/useFloatingPanelDismiss'

interface SettingsPresetMenuProps {
  /** 現在読み込んでいる設定プリセット名(未ロードならnull) */
  currentSettingsName: string | null
  presetNames: string[]
  onLoadPreset: (name: string) => void
  onOpenSaveDialog: () => void
  onOpenEditDialog: () => void
}

/**
 * 設定の保存・読み込みをまとめたドロップダウンメニュー。トリガーボタンには現在読み込み中の
 * 設定名を表示し、開くと保存済みプリセット名の一覧(クリックで即読み込み)と、
 * 名前を付けて保存するダイアログ、デフォルト指定・削除ができる編集ダイアログを開くための項目を並べる
 */
export function SettingsPresetMenu({
  currentSettingsName,
  presetNames,
  onLoadPreset,
  onOpenSaveDialog,
  onOpenEditDialog,
}: SettingsPresetMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)

  const openMenu = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnchor({ x: rect.left, y: rect.bottom + 4 })
  }
  const closeMenu = (): void => setAnchor(null)

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="settings-preset-menu-trigger"
        onClick={() => (anchor ? closeMenu() : openMenu())}
      >
        <span className="settings-preset-menu-trigger-label">
          {currentSettingsName ?? '設定'}
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {anchor && (
        <SettingsPresetMenuPanel
          anchor={anchor}
          presetNames={presetNames}
          onLoadPreset={(name) => {
            onLoadPreset(name)
            closeMenu()
          }}
          onOpenSaveDialog={() => {
            onOpenSaveDialog()
            closeMenu()
          }}
          onOpenEditDialog={() => {
            onOpenEditDialog()
            closeMenu()
          }}
          onClose={closeMenu}
        />
      )}
    </>
  )
}

function SettingsPresetMenuPanel({
  anchor,
  presetNames,
  onLoadPreset,
  onOpenSaveDialog,
  onOpenEditDialog,
  onClose,
}: {
  anchor: { x: number; y: number }
  presetNames: string[]
  onLoadPreset: (name: string) => void
  onOpenSaveDialog: () => void
  onOpenEditDialog: () => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  useFloatingPanelDismiss(menuRef, anchor, onClose)

  // .settings-actions内の子孫セレクタ(`.settings-actions button { width: 100% }`等)を
  // 巻き込まないよう、bodyへポータルして描画する
  return createPortal(
    <div
      ref={menuRef}
      className="floating-panel settings-preset-menu"
      role="menu"
      style={{ left: anchor.x, top: anchor.y }}
    >
      {presetNames.length > 0 && (
        <>
          {presetNames.map((name) => (
            <button
              key={name}
              type="button"
              role="menuitem"
              className="menu-item-base settings-preset-menu-item"
              onClick={() => onLoadPreset(name)}
            >
              {name}
            </button>
          ))}
          <div className="settings-preset-menu-divider" />
        </>
      )}
      <button
        type="button"
        role="menuitem"
        className="menu-item-base settings-preset-menu-item"
        onClick={onOpenSaveDialog}
      >
        保存…
      </button>
      <button
        type="button"
        role="menuitem"
        className="menu-item-base settings-preset-menu-item"
        onClick={onOpenEditDialog}
      >
        編集…
      </button>
    </div>,
    document.body,
  )
}
