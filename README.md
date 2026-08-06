# path2plot

SVGを読み込み、ペンプロッター(3Dプリンタ+ペンアタッチメント)向けのG-codeを出力するブラウザ完結型のWebアプリ。分割されたパスの端点を結合して一筆書き化し、ペンアップ移動距離が短くなるよう描画順を自動最適化する。fill属性からの塗りつぶしパス(ハッチング)生成にも対応する。

色ごとのペン自動分割やストロークの手動並び替えUIは未実装(現状は単一ペン前提)。詳細な仕様は [reference/SPEC.md](reference/SPEC.md)、実装進捗は [reference/implementation-status.md](reference/implementation-status.md) を参照。

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

## ライセンス

MIT © 2026 Takuya Urakawa (5z6p.com)
