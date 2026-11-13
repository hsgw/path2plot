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

Raspberry Pi上でMoonrakerへのG-code保存・印刷ボタンを有効にする場合は、Pi専用ビルドを使います。

```bash
npm run build:pi
npm run dev:pi
```

Moonrakerは同じホストの7125番ポートへ接続します。ブラウザからの接続を許可するため、MoonrakerのCORS設定でアプリのオリジンを許可してください。確認済み環境では `http://192.168.0.31:8081` は許可されましたが、`http://klipper.local:8081` は許可されませんでした。エラーが出る場合は、PiのIPアドレスでアプリを開いてください。設定変更後はMoonrakerを再起動します。

「Moonrakerへ保存」はG-codeをgcodesフォルダに保存します。「G-codeを保存して印刷」は確認後、同じ場所に保存して印刷を要求します。Moonrakerの応答に応じて、印刷開始・待機列への追加・保存のみの結果を表示します。同名ファイルがある場合は上書きを確認します。ローカルへのダウンロードも引き続き利用できます。

`npm run dev:pi` はコマンドを実行したマシン上で開発サーバーを起動します。保存先はブラウザで開いたホストと同じなので、ローカルPC上で起動した場合はPiに送信されません。Pi上で起動する場合も、IPアドレスでアクセスできるよう開発サーバーの待受設定が必要です。

## スクリプト

- `npm run dev` — 開発サーバー起動
- `npm run dev:pi` — Moonraker保存・印刷UI付き開発サーバー
- `npm run build` — 型チェック + 本番ビルド
- `npm run build:pi` — Moonraker保存・印刷UI付き本番ビルド
- `npm run build:cli` — 型チェック + Node.js CLIのビルド
- `npm run build:cli:pi` — Moonraker印刷対応CLIのビルド（`dist-ssr/pi/path2plot-cli.mjs`）
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

組み込みの初期値では、上の5つのパス設定はすべて `true` です。塗りは `fillSettings`、曲線の折線近似精度は `parseSettings.bezierToleranceMm`、短い線の除外は最小長の設定で調整します。結合や塗りのストローク別上書きは、読み込んだSVGに紐づく編集です。共有JSONは全体設定とパス処理モードを保存し、インポートするとSVG固有の上書きを解除します。

SVGはUTF-8のXMLとして読み込みます。標準のXML文字参照を使用でき、独自のDTD実体参照は未対応です。

### Raspberry PiとPythonから実行する

ビルド用PCで作った `dist-ssr/path2plot-cli.mjs` を Raspberry Pi 3 Model B（Raspbian 13、ARMv7/armhf）へコピーします。CLIの依存はファイルに同梱されるため、Piではインストール済みの `/usr/local/bin/node`（v22.23.4）で実行できます。

Raspberry Pi（`klipper`）では、Web版の組み込み初期値をまとめた共有JSONを `/usr/local/share/path2plot/defaults.json` に配置しています。Pi上の別プロジェクトからも、この絶対パスを `--config` に渡して参照できます。`--config` はPiでも必須で、省略すると変換前にエラーで終了します。組み込み初期値の変更を共有JSONに反映するには、ファイルを再出力して更新します。

CLIをたとえば `/opt/path2plot/` に置いた場合は、Pythonから次のように呼び出せます。

```python
import subprocess

result = subprocess.run(
    [
        "/usr/local/bin/node",
        "/opt/path2plot/path2plot-cli.mjs",
        "--input", "/tmp/input.svg",
        "--output", "/tmp/output.gcode",
        "--config", "/usr/local/share/path2plot/defaults.json",
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

Pi上のCLIから保存と印刷を続けて行うには、`npm run build:cli:pi` でビルドしたCLIをPiへコピーし、上の引数に `--print` を追加します。CLIは `--output` にG-codeを書き出した後、そのファイル名で同じPiのMoonraker（`127.0.0.1:7125`）へ送信します。Moonrakerに同名ファイルがある場合は、明示的に `--overwrite` を指定したときだけ上書きします。ローカルの出力ファイルは引き続き上書きされません。印刷開始や待機列への追加は標準エラー出力で確認でき、印刷要求に失敗した場合も書き出したファイルは残ります。

## 免責事項

本ソフトウェアは無保証で提供されます。本ソフトウェアの利用(生成したG-codeによるペンプロッター等のハードウェアの制御を含む)により生じたいかなる損害についても、作者は一切の責任を負いません。自己責任でご利用ください。

## ライセンス

MIT © 2026 Takuya Urakawa (5z6p.com)
