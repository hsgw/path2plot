# ライブラリ候補メモ

## ポリゴンクリッピング・オフセット(Phase 5: 塗りつぶし処理)

塗りブロックのオフセット(輪郭インセット)・クリッピング(ハッチ線の塗り領域内トリム)に使用。SPEC.md NFR-2/FR-20参照。

- `clipper-lib`: Clipper1(Angus Johnson版)のJS移植。実績が長く情報も多いが、更新が緩やか。座標は整数スケーリングが前提(浮動小数点をそのまま渡せない)。
- `clipper2-js`: Clipper2のJS/TS移植。**検討したが不採用**。`package.json`が`@angular/common`/`@angular/core`をpeerDependenciesに宣言しており、`npm install`時にAngular一式(rxjs・zone.js含む)が実際にnode_modulesへインストールされ、high severity脆弱性が3件検出された(2026-07-13確認)。実行時にAngularを実際にimportしているわけではなさそうだが、依存木として不適切と判断。
- `clipper2-ts`(採用、2026-07-13): 本家Clipper2の忠実なTS移植(countertype/clipper2-ts)。依存ゼロ・peer依存もなし。floating-point API(PathD/PathsD、unionD/inflatePathsD/areaD/isPositiveD等)完備、開放パスクリッピング(`ClipperD.addOpenSubjectPaths`)にも対応。自体もvitestでテストされている。

**選定結果**: `clipper2-ts`を採用。TypeScript対応・evenodd/nonzero両対応・round joinオフセット・開放パスクリッピングをすべて満たし、かつ依存関係がクリーン。
