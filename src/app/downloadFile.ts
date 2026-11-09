/** テキストをファイルとしてダウンロードさせる(Blob + 一時的な<a>のクリック) */
export function downloadTextFile(
  text: string,
  fileName: string,
  mimeType = 'text/plain',
): void {
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** 読み込んだSVGのファイル名から、出力するG-codeのファイル名を作る */
export function gcodeFileNameFor(svgFileName: string | null): string {
  return `${(svgFileName ?? 'output').replace(/\.svg$/i, '')}.gcode`
}

/** Moonrakerのgcodes領域へ保存する。印刷は開始しない。 */
export async function uploadGcodeToMoonraker(
  text: string,
  fileName: string,
): Promise<boolean> {
  // path2plot はPi上の8081等で配信され、Moonrakerは同じホストの7125で待ち受ける。
  const baseUrl = `${window.location.protocol}//${window.location.hostname}:7125`
  const listResponse = await fetch(`${baseUrl}/server/files/list?root=gcodes`)
  if (!listResponse.ok)
    throw new Error(`Moonraker応答エラー (${listResponse.status})`)
  const listing = (await listResponse.json()) as { result?: unknown }
  if (!Array.isArray(listing.result)) {
    throw new Error('Moonrakerからファイル一覧を取得できませんでした')
  }
  if (
    listing.result.some((file: { path?: string }) => file.path === fileName)
  ) {
    if (
      !window.confirm(
        `Moonrakerに「${fileName}」が既にあります。上書きしますか？`,
      )
    )
      return false
  }

  const form = new FormData()
  form.append('file', new File([text], fileName, { type: 'text/plain' }))
  form.append('root', 'gcodes')
  form.append('print', 'false')
  const response = await fetch(`${baseUrl}/server/files/upload`, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) throw new Error(`Moonraker保存エラー (${response.status})`)
  return true
}
