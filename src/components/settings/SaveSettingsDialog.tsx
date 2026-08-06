import { useEffect, useState } from 'react'
import { XMarkIcon } from '../common/icons'

interface SaveSettingsDialogProps {
  /** 既存のプリセット名一覧(上書き保存であることの案内に使う) */
  existingNames: string[]
  /** 現在デフォルトになっているプリセット名。未設定ならnull */
  defaultName: string | null
  onSave: (name: string, asDefault: boolean) => void
  onClose: () => void
}

/** 現在の設定一式に名前を付けて保存するダイアログ */
export function SaveSettingsDialog({
  existingNames,
  defaultName,
  onSave,
  onClose,
}: SaveSettingsDialogProps) {
  const [name, setName] = useState(defaultName ?? '')
  const [asDefault, setAsDefault] = useState(defaultName === null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const trimmedName = name.trim()
  const willOverwrite = existingNames.includes(trimmedName)

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (trimmedName === '') return
    onSave(trimmedName, asDefault)
  }

  return (
    <div
      className="help-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-settings-dialog-title"
      >
        <div className="help-dialog-header">
          <h2 id="save-settings-dialog-title">設定を保存</h2>
          <button
            type="button"
            className="help-dialog-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            <XMarkIcon />
          </button>
        </div>
        <form className="settings-preset-form" onSubmit={handleSubmit}>
          <label>
            <span className="field-label">名前</span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {willOverwrite && (
            <p className="settings-preset-hint">
              「{trimmedName}」は既に存在します。保存すると上書きされます。
            </p>
          )}
          <label className="settings-checkbox-label">
            <input
              type="checkbox"
              checked={asDefault}
              disabled={defaultName === null}
              onChange={(e) => setAsDefault(e.target.checked)}
            />
            起動時に自動で読み込む(デフォルト)
          </label>
          <div className="confirm-dialog-actions">
            <button type="button" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" disabled={trimmedName === ''}>
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
