import { useEffect } from 'react'
import { MarkGithubIcon, XMarkIcon } from './icons'

interface HelpDialogProps {
  onClose: () => void
  showOnStartup: boolean
  onShowOnStartupChange: (value: boolean) => void
}

export function HelpDialog({
  onClose,
  showOnStartup,
  onShowOnStartupChange,
}: HelpDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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
        aria-labelledby="help-dialog-title"
      >
        <div className="help-dialog-header">
          <h2 id="help-dialog-title">path2plot</h2>
          <button
            type="button"
            className="help-dialog-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            <XMarkIcon />
          </button>
        </div>

        <a
          className="help-dialog-repo-link"
          href="https://github.com/hsgw/path2plot"
          target="_blank"
          rel="noreferrer"
        >
          <MarkGithubIcon /> GitHub
        </a>

        <section className="help-dialog-section">
          <h3>免責事項</h3>
          <p>
            本ソフトウェアは無保証で提供されます。本ソフトウェアの利用(生成したG-codeによるペンプロッター等のハードウェアの制御を含む)により生じたいかなる損害についても、作者は一切の責任を負いません。自己責任でご利用ください。
          </p>
        </section>

        <section className="help-dialog-section">
          <h3>基本の流れ</h3>
          <ol>
            <li>
              (初回のみ)SVGを読み込む前に、G-codeタブで描画可能領域・原点・パーク位置・テンプレートを環境に合わせて編集しておく
            </li>
            <li>「SVG読み込み」でSVGファイルを読み込む</li>
            <li>
              必要に応じてSVGタブの設定(読み込み設定・ペン設定・パス結合距離・塗りつぶし設定など)を調整する
            </li>
            <li>「パス結合」を実行する</li>
            <li>「最適化」を実行する</li>
            <li>
              G-codeタブでベッドサイズや速度などのG-code設定を確認・調整する
            </li>
            <li>「G-codeをダウンロード」で出力する</li>
          </ol>
          <p className="help-dialog-hint">
            設定を変更した後は、パス結合・最適化を手動で再実行してください(変更は自動的には反映されません)。
          </p>
        </section>

        <section className="help-dialog-section">
          <h3>ライセンス表記</h3>
          <p>
            本ソフトウェアはMIT License(© 2026 Takuya Urakawa /
            5z6p.com)のもとで公開されています。以下は利用している主なライブラリのライセンスです。
          </p>
          <ul className="help-dialog-license-list">
            <li>
              <a
                href="https://github.com/facebook/react/blob/main/LICENSE"
                target="_blank"
                rel="noreferrer"
              >
                React / React DOM
              </a>{' '}
              — MIT License
            </li>
            <li>
              <a
                href="https://github.com/countertype/clipper2-ts"
                target="_blank"
                rel="noreferrer"
              >
                clipper2-ts
              </a>{' '}
              — Boost Software License 1.0
            </li>
            <li>
              <a
                href="https://github.com/tailwindlabs/heroicons/blob/master/LICENSE"
                target="_blank"
                rel="noreferrer"
              >
                Heroicons (mini/solid)
              </a>{' '}
              — MIT License
            </li>
            <li>
              <a
                href="https://github.com/primer/octicons/blob/main/LICENSE"
                target="_blank"
                rel="noreferrer"
              >
                Octicons
              </a>{' '}
              — MIT License
            </li>
          </ul>
        </section>

        <label className="settings-checkbox-label">
          <input
            type="checkbox"
            checked={showOnStartup}
            onChange={(e) => onShowOnStartupChange(e.target.checked)}
          />
          起動時にこのポップアップを表示する
        </label>
      </div>
    </div>
  )
}
