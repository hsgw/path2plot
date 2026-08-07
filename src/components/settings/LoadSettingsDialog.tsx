import { useEffect, useState } from 'react'
import { XMarkIcon } from '../common/icons'

interface LoadSettingsDialogProps {
  names: string[]
  defaultName: string | null
  onLoad: (name: string) => void
  onSetDefault: (name: string) => void
  onDelete: (name: string) => void
  onClose: () => void
}

/** 保存済みの設定プリセットから選んでロードするダイアログ */
export function LoadSettingsDialog({
  names,
  defaultName,
  onLoad,
  onSetDefault,
  onDelete,
  onClose,
}: LoadSettingsDialogProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="modal-backdrop help-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-settings-dialog-title"
      >
        <div className="help-dialog-header">
          <h2 id="load-settings-dialog-title">設定を読み込む</h2>
          <button
            type="button"
            className="help-dialog-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            <XMarkIcon />
          </button>
        </div>
        {names.length === 0 ? (
          <p className="settings-preset-hint">保存された設定はありません。</p>
        ) : (
          <ul className="settings-preset-list">
            {names.map((name) => (
              <li key={name} className="settings-preset-list-item">
                <div className="settings-preset-list-name">
                  {name}
                  {name === defaultName && (
                    <span className="settings-preset-badge">デフォルト</span>
                  )}
                </div>
                <div className="settings-preset-list-actions">
                  <button type="button" onClick={() => onLoad(name)}>
                    読み込み
                  </button>
                  <button
                    type="button"
                    disabled={name === defaultName}
                    onClick={() => onSetDefault(name)}
                  >
                    デフォルトに設定
                  </button>
                  {pendingDelete === name ? (
                    <>
                      <span className="settings-preset-hint">削除する?</span>
                      <button
                        type="button"
                        className="confirm-dialog-danger"
                        onClick={() => {
                          onDelete(name)
                          setPendingDelete(null)
                        }}
                      >
                        削除
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(null)}
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(name)}
                    >
                      削除
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
