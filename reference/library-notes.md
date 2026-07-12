# ライブラリ候補メモ

## ポリゴンクリッピング・オフセット(Phase 5: 塗りつぶし処理)

塗りブロックのオフセット(輪郭インセット)・クリッピング(ハッチ線の塗り領域内トリム)に使用。SPEC.md NFR-2/FR-20参照。選定はPhase 5実装時に行う。

- `clipper-lib`: Clipper1(Angus Johnson版)のJS移植。実績が長く情報も多いが、更新が緩やか。座標は整数スケーリングが前提(浮動小数点をそのまま渡せない)。
- `clipper2-js`: Clipper2のJS/TS移植。Clipper1後継で高速化・API整理がされている。TypeScript型定義あり。比較的新しく実績はclipper-libより少ない。

**選定時の確認観点**: TypeScript対応、bundleサイズ、evenodd/nonzero両対応、round joinオフセットの精度、メンテナンス状況。
