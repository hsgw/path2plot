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

export type MoonrakerUploadResult =
  | { saved: false }
  | {
      saved: true
      printStatus:
        'not_requested' | 'started' | 'queued' | 'not_started' | 'unknown'
    }

export interface MoonrakerUploadOptions {
  baseUrl?: string
  print?: boolean
  overwrite?: boolean
  confirmOverwrite?: (fileName: string) => boolean
}

/** Moonrakerのgcodes領域へ保存する。print=trueの場合は印刷開始要求も行う。 */
export async function uploadGcodeToMoonraker(
  text: string,
  fileName: string,
  options: MoonrakerUploadOptions = {},
): Promise<MoonrakerUploadResult> {
  const baseUrl =
    options.baseUrl ??
    `${window.location.protocol}//${window.location.hostname}:7125`
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
    if (options.overwrite !== true) {
      const confirmOverwrite =
        options.confirmOverwrite ??
        ((name: string) =>
          window.confirm(
            `Moonrakerに「${name}」が既にあります。上書きしますか？`,
          ))
      if (!confirmOverwrite(fileName)) return { saved: false }
    }
  }

  const form = new FormData()
  form.append('file', new File([text], fileName, { type: 'text/plain' }))
  form.append('root', 'gcodes')
  form.append('print', options.print ? 'true' : 'false')
  const response = await fetch(`${baseUrl}/server/files/upload`, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) throw new Error(`Moonraker保存エラー (${response.status})`)
  if (!options.print) return { saved: true, printStatus: 'not_requested' }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    // Upload can succeed while its response omits a print status.
  }
  if (!payload || typeof payload !== 'object')
    return { saved: true, printStatus: 'unknown' }
  const body = payload as Record<string, unknown>
  const result = (
    body.result && typeof body.result === 'object' ? body.result : body
  ) as Record<string, unknown>
  if (result.print_started === true)
    return { saved: true, printStatus: 'started' }
  if (result.print_queued === true)
    return { saved: true, printStatus: 'queued' }
  if (result.print_started === false && result.print_queued === false)
    return { saved: true, printStatus: 'not_started' }
  return { saved: true, printStatus: 'unknown' }
}
