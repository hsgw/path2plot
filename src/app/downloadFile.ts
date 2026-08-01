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
