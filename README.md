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
- `npm run build:cli` — 型チェック + Node.js CLIのビルド
- `npm run test` — テスト実行(Vitest)
- `npm run lint` — Lint実行(oxlint)
- `npm run format` — Prettierでフォーマット

## Node.js CLI

Web版と共通のSVG解析、結合、塗り、書き順最適化、G-codeテンプレート処理を、Node.js 22.23.4から1コマンドで実行できます。

```bash
npm ci
npm run build:cli
node dist-ssr/path2plot-cli.mjs \
  --input input.svg --output output.gcode --config path2plot-settings.json --timing
```

最初の実行では、下記の手順でWeb版から設定JSONを保存し、SVGと同じ作業フォルダに置きます。`--output` にはまだ存在しないファイル名を指定してください。ビルド後は `node dist-ssr/path2plot-cli.mjs --help` で引数を確認できます。

変換が成功すると終了コードは0になります。通常の変換で標準出力には何も出ません。出力はUTF-8で末尾に改行が付きます。既存の出力ファイルがある場合や、入力・設定にエラーがある場合は終了コード1を返し、詳細を標準エラー出力に表示します。コマンドの概要とバージョンは `--help` と `--version` で表示できます。

`--timing` はSVG読み込み、SVG解析、パス処理、G-code生成、合計時間を標準エラー出力に表示します。合計には設定の読み込みとファイル出力を含み、Node.js起動時間は含みません。

### Web版とCLIで設定を共有する

Web版の左上にある設定名のメニューから「JSONをエクスポート」を選ぶと、現在の設定を `path2plot-settings.json` として保存できます。同じメニューの「JSONをインポート…」からファイルを選ぶと、設定欄に反映されます。不正なファイルの場合は、現在の設定を保持したままエラーが表示されます。エクスポートしたファイルをそのままCLIの `--config` に指定できます。

ファイルのルートは `schemaVersion` と `settings` です。`settings` は `parseSettings`、`gcodeSettings`（`templates` を含む）、`fillSettings`、`pathOptions` と、`joinDistanceMm`、`penWidthMm`、`minStrokeLengthMm` を保持します。省略した項目は共通の初期値で補完します。例えば、SVGのストローク順と方向を保持したい場合は次の設定を使用できます。

```json
{
  "schemaVersion": 1,
  "settings": {
    "gcodeSettings": { "bedWidthMm": 89, "bedHeightMm": 53 },
    "pathOptions": { "optimizePaths": false }
  }
}
```

| パス設定         | 動作                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `optimizePaths`  | パス処理全体のスイッチ。falseでストロークの出現順と向きを保持                                               |
| `joinPaths`      | 端点結合を有効にする。反転を許可しない場合は出現順で隣接する終点→始点のみを結合                             |
| `optimizeTravel` | ペンアップ移動の最適化を有効にする。falseでも端点結合は有効にできる                                         |
| `reorderPaths`   | 移動最適化時にユニットや塗りブロック内のセグメントを並び替える                                              |
| `reversePaths`   | 移動最適化と端点結合で反転を許可する。結合時は離れた位置に出現するストロークも1ブロックにまとまることがある |

`optimizePaths` と `optimizeTravel` の初期値はtrueで、各処理フラグの初期値はfalseです。塗りは `fillSettings`、曲線の折線近似精度は `parseSettings.bezierToleranceMm`、短い線の除外は最小長の設定で調整します。結合や塗りのストローク別上書きは、読み込んだSVGに紐づく編集です。共有JSONは全体設定とパス処理モードを保存し、インポートするとSVG固有の上書きを解除します。

SVGはUTF-8のXMLとして読み込みます。標準のXML文字参照を使用でき、独自のDTD実体参照は未対応です。

### Raspberry PiとPythonから実行する

ビルド用PCで作った `dist-ssr/path2plot-cli.mjs` を Raspberry Pi 3 Model B（Raspbian 13、ARMv7/armhf）へコピーします。CLIの依存はファイルに同梱されるため、Piではインストール済みの `/usr/local/bin/node`（v22.23.4）で実行できます。CLIと設定JSONをたとえば `/opt/path2plot/` に置いた場合は次のように呼び出せます。

```python
import subprocess

result = subprocess.run(
    [
        "/usr/local/bin/node",
        "/opt/path2plot/path2plot-cli.mjs",
        "--input", "/tmp/input.svg",
        "--output", "/tmp/output.gcode",
        "--config", "/opt/path2plot/path2plot-settings.json",
        "--timing",
    ],
    check=True,
    capture_output=True,
    text=True,
    encoding="utf-8",
)
print(result.stderr, end="")
```

失敗時は `subprocess.CalledProcessError` の `returncode` と `stderr` を確認できます。ARMv7実機での起動・変換時間およびKlipperの描画は実機で確認してください。

## 免責事項

本ソフトウェアは無保証で提供されます。本ソフトウェアの利用(生成したG-codeによるペンプロッター等のハードウェアの制御を含む)により生じたいかなる損害についても、作者は一切の責任を負いません。自己責任でご利用ください。

## ライセンス

MIT © 2026 Takuya Urakawa (5z6p.com)
