# path2plot

SVGを読み込み、ペンプロッター(3Dプリンタ+ペンアタッチメント)向けのG-codeを出力するブラウザ完結型のWebアプリ。分割されたパスの端点を結合して一筆書き化し、ペンアップ移動距離が短くなるよう描画順を自動最適化する。fill属性からの塗りつぶしパス(ハッチング)生成にも対応する。

色ごとのペン自動分割やストロークの手動並び替えUIは未実装(現状は単一ペン前提)。詳細な仕様は [reference/SPEC.md](reference/SPEC.md) を参照。

## 公開

https://hsgw.github.io/path2plot/ で公開されています。`main` ブランチへのpushでGitHub Actionsが自動的にビルド・デプロイします。

## 開発

```bash
npm install
npm run dev
```

## スクリプト

- `npm run dev` — 開発サーバー起動
- `npm run build` — 型チェック + 本番ビルド
- `npm run test` — テスト実行(Vitest)
- `npm run lint` — Lint実行(oxlint)
- `npm run format` — Prettierでフォーマット

## 免責事項

本ソフトウェアは無保証で提供されます。本ソフトウェアの利用(生成したG-codeによるペンプロッター等のハードウェアの制御を含む)により生じたいかなる損害についても、作者は一切の責任を負いません。自己責任でご利用ください。

## ライセンス

MIT © 2026 Takuya Urakawa (5z6p.com)
