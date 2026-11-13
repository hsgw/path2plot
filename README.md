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

組み込み初期値は [`src/core/default-settings.json`](src/core/default-settings.json) で管理します。Web と CLI はビルド時にこの JSON を取り込みます。初期値を変更したら再ビルドし、Pi の共有設定にも同じファイルを配備します。Web の保存済み `default` は、前回の組み込み初期値と一致する場合に更新されます。

Raspberry Pi（`klipper`）では、共有 JSON を `/usr/local/share/path2plot/defaults.json` に配置しています。Pi 上の別プロジェクトからも、この絶対パスを `--config` に渡して参照できます。`--config` は Pi でも必須で、省略すると変換前にエラーで終了します。Pi でリポジトリを更新した後は、そのルートで次を実行して共有設定を更新できます。

```bash
shared=/usr/local/share/path2plot/defaults.json
tmp=$(mktemp "$shared.XXXXXXXX")
install -m 644 src/core/default-settings.json "$tmp" && mv -T "$tmp" "$shared"
```

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

## Raspberry Pi の HTTP API

API は Pi の Node.js プロセスで動かし、Nginx の `/path2plot/api/` を経由して呼び出します。保存と印刷は Pi 内の Moonraker（`127.0.0.1:7125`）へ送ります。別の Web アプリのバックエンドから API を呼ぶと、トークンをブラウザに配布せずに連携できます。

### リクエスト

| メソッドとパス                   | 動作                                              |
| -------------------------------- | ------------------------------------------------- |
| `GET /path2plot/api/v1/health`   | API プロセスの稼働確認                            |
| `POST /path2plot/api/v1/convert` | SVG を変換し、G-code テキストを返す               |
| `POST /path2plot/api/v1/save`    | SVG を変換して Moonraker に保存する               |
| `POST /path2plot/api/v1/print`   | SVG を変換して Moonraker に保存し、印刷を要求する |

POST には `Content-Type: application/json` が必要です。`PATH2PLOT_API_TOKEN` を設定した場合は `Authorization: Bearer <トークン>` も送ります。`fileName` と `overwrite` は保存・印刷用です。`config` を省略すると、Pi の共有設定 `/usr/local/share/path2plot/defaults.json` を使います。設定を渡す場合は、Web 版からエクスポートした JSON をオブジェクトとして指定します。

`convert` の成功応答は `text/plain` なので `response.text()` で読み取ります。ほかの成功応答は JSON です。POST の本文は 2 MiB までです。

```js
const response = await fetch('http://192.168.0.31:8081/path2plot/api/v1/save', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path stroke="black" d="M1 2 L8 9"/></svg>',
    fileName: 'drawing.gcode',
    overwrite: false,
  }),
})
if (!response.ok) throw new Error((await response.json()).error)
console.log(await response.json())
```

保存・印刷の応答には `fileName` と `printStatus` が含まれます。状態は `not_requested`（保存のみ）、`started`（印刷開始）、`queued`（待機列へ追加）、`not_started`（保存済み・未開始）、`unknown`（保存済み・開始状態不明）です。成功応答を受け取った後も、印刷が始まったかどうかは `printStatus` で判断してください。同名ファイルは `overwrite: true` の場合に上書きし、省略時は HTTP 409 を返します。印刷要求の応答が失われた場合は、Moonraker の状態を確認してから再実行してください。

### Pi への配置

リポジトリのルートで `npm ci` と `npm run build:api:pi` を実行します。生成される `dist-ssr/pi/path2plot-api.mjs` を Pi の配置先に置きます。以下は既存の `/home/hsgw/path2plot-deploy/source` でビルドする例です。

`/etc/systemd/system/path2plot-api.service` に以下を設定します。別のユーザーや配置先を使う場合は `User` と `ExecStart` を合わせます。

```ini
[Unit]
Description=path2plot HTTP API
After=network.target

[Service]
User=hsgw
EnvironmentFile=-/etc/path2plot-api.env
ExecStart=/usr/local/bin/node /home/hsgw/path2plot-deploy/source/dist-ssr/pi/path2plot-api.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`/etc/path2plot-api.env` は任意です。認証を併用する場合は `PATH2PLOT_API_TOKEN` を設定し、ファイルは root のみ読み取れるようにします。別オリジンのブラウザから直接呼ぶ場合は、呼び出し元のオリジンを `PATH2PLOT_API_ORIGINS` にカンマ区切りで設定します。サーバー間の通信には CORS 設定は不要です。

既存の Nginx の `server` ブロック（この Pi では `/etc/nginx/sites-available/path2plot`）に、次の `location` を追加します。HTTP ではトークンが暗号化されないため、信頼できる LAN 内で使用するか、Nginx で HTTPS を設定してください。

```nginx
location /path2plot/api/ {
    allow 127.0.0.1;
    allow 192.168.0.0/24;
    # AP モードも使う場合は、実際の AP 用サブネットも allow で追加
    deny all;
    client_max_body_size 2m;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_next_upstream off;
    proxy_pass http://127.0.0.1:8787;
}
```

`allow` には Pi 自身の IP ではなく、呼び出す端末のサブネットを指定します。例の `192.168.0.0/24` は実際の LAN に合わせて変更してください。Pi のアドレスが同じサブネット内で変わっても許可設定はそのまま使えます。AP モードで別のサブネットになる場合は、AP の DHCP プロファイルで配布範囲を固定し、そのサブネットも許可します。呼び出し先の URL は接続中のネットワークで到達できる Pi のアドレスを使います。同じ Nginx で配信するアプリは `/path2plot/api/v1/save` のような相対 URL を使えます。トークンを設定しない場合、許可したネットワークの端末から印刷を要求できます。

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now path2plot-api
sudo nginx -t && sudo systemctl reload nginx
curl -fsS http://127.0.0.1:8081/path2plot/api/v1/health
```

API を再ビルドしたら `sudo systemctl restart path2plot-api` で更新します。

## 免責事項

本ソフトウェアは無保証で提供されます。本ソフトウェアの利用(生成したG-codeによるペンプロッター等のハードウェアの制御を含む)により生じたいかなる損害についても、作者は一切の責任を負いません。自己責任でご利用ください。

## ライセンス

MIT © 2026 Takuya Urakawa (5z6p.com)
