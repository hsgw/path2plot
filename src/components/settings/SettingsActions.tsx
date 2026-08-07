import { useRef, useState } from 'react'
import type { SettingsBundle } from '../../app/settingsStorage'
import {
  deleteSettingsPreset,
  getDefaultSettingsPresetName,
  listSettingsPresetNames,
  loadSettingsPreset,
  saveSettingsPreset,
  setDefaultSettingsPresetName,
} from '../../app/settingsStorage'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { LoadSettingsDialog } from './LoadSettingsDialog'
import { SaveSettingsDialog } from './SaveSettingsDialog'
import { SettingsPresetMenu } from './SettingsPresetMenu'

interface SettingsActionsProps {
  onFileSelected: (text: string, fileName: string) => void
  /** FR-14: パス結合(端点結合)を実行する */
  onJoinPaths: () => void
  /** FR-15: 貪欲法による並び替えを実行する */
  onOptimize: () => void
  /** 並び替え・パス結合の上書きをすべてクリアし、出現順+未結合の状態に戻す */
  onResetAll: () => void
  /** パス結合/最適化ボタンのdisabled判定用 */
  hasEntries: boolean
  canDownloadGcode: boolean
  boundsWarningCount: number
  onDownloadGcode: () => void
  /** 現在の設定一式(保存ダイアログで使う) */
  settingsBundle: SettingsBundle
  /** プリセットをロードした結果を各設定へ反映する */
  onLoadSettingsBundle: (bundle: SettingsBundle, name: string) => void
  /** 現在読み込んでいる設定プリセット名(未ロードならnull) */
  currentSettingsName: string | null
  /** 保存した設定プリセット名を「現在読み込んでいる設定」として反映する */
  onSettingsNameChange: (name: string) => void
}

/** 設定列の先頭に置く操作ボタン群(保存・ロード / 読み込み・並び順操作 / G-code出力) */
export function SettingsActions({
  onFileSelected,
  onJoinPaths,
  onOptimize,
  onResetAll,
  hasEntries,
  canDownloadGcode,
  boundsWarningCount,
  onDownloadGcode,
  settingsBundle,
  onLoadSettingsBundle,
  currentSettingsName,
  onSettingsNameChange,
}: SettingsActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isSaveOpen, setIsSaveOpen] = useState(false)
  const [isLoadOpen, setIsLoadOpen] = useState(false)
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false)
  // 保存/デフォルト設定/削除のたびにlocalStorageの内容を読み直させるための再描画トリガー
  const [, forceRerender] = useState(0)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => onFileSelected(text, file.name))
    e.target.value = ''
  }

  const presetNames = listSettingsPresetNames()
  const defaultPresetName = getDefaultSettingsPresetName()

  return (
    // ダイアログ群はposition:fixedのオーバーレイだが、CSS上は子孫セレクタでマッチしてしまうため
    // (`.settings-actions button`等)、.settings-actionsの外側の兄弟として描画する
    <>
      <div className="settings-actions">
        <div className="settings-actions-group">
          <SettingsPresetMenu
            currentSettingsName={currentSettingsName}
            presetNames={presetNames}
            onLoadPreset={(name) => {
              const bundle = loadSettingsPreset(name)
              if (bundle) onLoadSettingsBundle(bundle, name)
            }}
            onOpenSaveDialog={() => setIsSaveOpen(true)}
            onOpenEditDialog={() => setIsLoadOpen(true)}
          />
        </div>

        <div className="settings-actions-group">
          <input
            type="file"
            accept=".svg,image/svg+xml"
            ref={fileInputRef}
            className="settings-file-input-hidden"
            onChange={handleFileChange}
          />
          <div className="settings-actions-row">
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              SVG読み込み
            </button>
            <button type="button" onClick={() => setIsResetConfirmOpen(true)}>
              リセット
            </button>
          </div>
          <div className="settings-actions-row">
            <button
              type="button"
              onClick={onJoinPaths}
              disabled={!hasEntries}
              title="端点が近いストローク同士を結合ブロック化する(読込直後は未実行)"
            >
              パス結合
            </button>
            <button type="button" onClick={onOptimize} disabled={!hasEntries}>
              最適化
            </button>
          </div>
        </div>

        <div className="settings-actions-group">
          <button
            type="button"
            onClick={onDownloadGcode}
            disabled={!canDownloadGcode}
          >
            G-codeをダウンロード
          </button>
          {boundsWarningCount > 0 && (
            <p className="settings-warning-text">
              はみ出し警告({boundsWarningCount}
              件)が解消するまでダウンロードできません
            </p>
          )}
        </div>
      </div>

      {isSaveOpen && (
        <SaveSettingsDialog
          existingNames={presetNames}
          defaultName={defaultPresetName}
          onSave={(name, asDefault) => {
            saveSettingsPreset(name, settingsBundle, asDefault)
            forceRerender((v) => v + 1)
            onSettingsNameChange(name)
            setIsSaveOpen(false)
          }}
          onClose={() => setIsSaveOpen(false)}
        />
      )}

      {isLoadOpen && (
        <LoadSettingsDialog
          names={presetNames}
          defaultName={defaultPresetName}
          onLoad={(name) => {
            const bundle = loadSettingsPreset(name)
            if (bundle) onLoadSettingsBundle(bundle, name)
            setIsLoadOpen(false)
          }}
          onSetDefault={(name) => {
            setDefaultSettingsPresetName(name)
            forceRerender((v) => v + 1)
          }}
          onDelete={(name) => {
            deleteSettingsPreset(name)
            forceRerender((v) => v + 1)
          }}
          onClose={() => setIsLoadOpen(false)}
        />
      )}

      {isResetConfirmOpen && (
        <ConfirmDialog
          title="リセットの確認"
          message="パス結合・最適化・塗りの個別上書きなど、これまでの並び替え操作をすべて破棄します。よろしいですか?"
          confirmLabel="リセット"
          danger
          onConfirm={() => {
            onResetAll()
            setIsResetConfirmOpen(false)
          }}
          onCancel={() => setIsResetConfirmOpen(false)}
        />
      )}
    </>
  )
}
