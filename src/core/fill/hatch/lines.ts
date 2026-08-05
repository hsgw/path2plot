import type { Point } from '../../geometry/types'
import type { HatchWaveform } from '../types'
import { clipOpenLinesToPolygon } from '../clipper'
import { apply, rotateDeg } from '../../geometry/matrix'
import { boundsOfPoints } from '../../geometry/polygon'

export interface HatchParams {
  angleDeg: number
  spacingMm: number
  waveform: HatchWaveform
  waveAmplitudeMm: number
  waveLengthMm: number
  waveSegmentsPerCycle: number
}

/** 行内の断片1つ。点列は実空間だが、連結処理で使う範囲は回転空間のxで保持する */
export interface HatchSegment {
  /** 実空間の点列。回転空間のx昇順に正規化済み(points[0]が左端、末尾が右端) */
  points: Point[]
  /** 回転空間での左端x */
  xStart: number
  /** 回転空間での右端x */
  xEnd: number
}

/** ハッチ1行分のクリップ結果。行の情報は連結モード(FR-18)で必須なので潰さずに保持する */
export interface HatchRow {
  rowIndex: number
  /** 行内の断片。回転空間のx昇順に並ぶ */
  segments: HatchSegment[]
}

/** 1行あたりの点数の上限。波長を極端に小さくされた場合の暴走を防ぐ */
const MAX_POINTS_PER_ROW = 20000

/**
 * 走査線に対する垂直方向のずれ(回転空間)。位相は回転空間のx=0を基準に揃えるため、
 * 全ての行で波の山谷の位置が一致する。
 */
function waveOffsetAt(
  x: number,
  waveform: HatchWaveform,
  amplitude: number,
  waveLength: number,
): number {
  if (waveform === 'straight' || amplitude === 0) return 0
  const phase = x / waveLength - Math.floor(x / waveLength)
  if (waveform === 'sine') return amplitude * Math.sin(2 * Math.PI * phase)
  // triangle: sinと山谷の位置(phase 0.25 / 0.75)が一致する三角波
  if (phase <= 0.25) return amplitude * (4 * phase)
  if (phase <= 0.75) return amplitude * (2 - 4 * phase)
  return amplitude * (4 * phase - 4)
}

/**
 * 1行分のサンプリングx座標(回転空間)。波形の頂点・分割点はx=0基準の絶対位置に置き、
 * 両端に行の実際の端(minX/maxX)を足す。
 */
function sampleXs(
  minX: number,
  maxX: number,
  waveform: HatchWaveform,
  amplitude: number,
  waveLength: number,
  segmentsPerCycle: number,
): number[] {
  if (waveform === 'straight' || amplitude === 0) return [minX, maxX]

  const span = maxX - minX
  // triangleは半周期ごとの頂点だけで形が決まる。sineは1周期をsegmentsPerCycleで割る
  const rawStep =
    waveform === 'triangle'
      ? waveLength / 2
      : waveLength / Math.max(2, Math.round(segmentsPerCycle))
  const step = Math.max(rawStep, span / MAX_POINTS_PER_ROW)
  // triangleの頂点はphase 0.25/0.75、つまりwaveLength*0.25からstepごと
  const anchor = waveform === 'triangle' ? waveLength * 0.25 : 0

  const xs = [minX]
  const firstK = Math.ceil((minX - anchor) / step)
  for (let k = firstK; ; k++) {
    const x = anchor + k * step
    if (x >= maxX) break
    if (x > minX) xs.push(x)
  }
  xs.push(maxX)
  return xs
}

/**
 * FR-17/19: オフセット済みの塗り輪郭(穴を含む)に対し、角度・間隔・波形を指定してハッチングを
 * 生成する。angleDeg分だけ回転した空間で等間隔の走査線を作り、逆回転してからoffsetPathsで
 * 一括クリップする。戻り値は行番号昇順、各行の断片はx昇順(回転空間基準)。
 *
 * 波形を付けた場合、クリップ後の断片から行番号を復元する必要がある。各点のy から
 * その点のx における波のずれを差し引けば行の中心yが正確に得られるため、行ごとにクリップを
 * 呼び分ける(コストが行数倍になる)必要はない。
 */
export function generateHatchLines(
  offsetPaths: Point[][],
  params: HatchParams,
): HatchRow[] {
  const { angleDeg, spacingMm, waveform, waveLengthMm, waveSegmentsPerCycle } =
    params
  if (offsetPaths.length === 0 || spacingMm <= 0) return []

  // 振幅が線間隔の半分を超えると隣接行に食い込み、行番号の復元も破綻するためクランプする
  const amplitude =
    waveLengthMm > 0
      ? Math.min(Math.max(params.waveAmplitudeMm, 0), spacingMm / 2)
      : 0

  const toRotated = rotateDeg(-angleDeg)
  const toReal = rotateDeg(angleDeg)

  const rotatedPoints = offsetPaths.flatMap((path) =>
    path.map((p) => apply(toRotated, p)),
  )
  if (rotatedPoints.length === 0) return []

  const { minX, maxX, minY, maxY } = boundsOfPoints(rotatedPoints)

  const firstRowY = minY + spacingMm / 2
  const xs = sampleXs(
    minX,
    maxX,
    waveform,
    amplitude,
    waveLengthMm,
    waveSegmentsPerCycle,
  )
  const offsets = xs.map((x) =>
    waveOffsetAt(x, waveform, amplitude, waveLengthMm),
  )

  const rawLines: Point[][] = []
  for (let y = firstRowY; y <= maxY; y += spacingMm) {
    rawLines.push(xs.map((x, i) => apply(toReal, { x, y: y + offsets[i] })))
  }
  if (rawLines.length === 0) return []

  const clipped = clipOpenLinesToPolygon(rawLines, offsetPaths)

  const withRowInfo = clipped.map((segment) => {
    const rotatedSegment = segment.map((p) => apply(toRotated, p))
    // 各点のyから波のずれを引くと行の中心yになる。断片全体で平均してクリップ時の丸めを均す
    const centerYSum = rotatedSegment.reduce(
      (sum, p) =>
        sum + p.y - waveOffsetAt(p.x, waveform, amplitude, waveLengthMm),
      0,
    )
    const centerY = centerYSum / rotatedSegment.length
    const rotatedStartX = rotatedSegment[0].x
    const rotatedEndX = rotatedSegment.at(-1)!.x
    const ascending =
      rotatedStartX <= rotatedEndX ? segment : [...segment].reverse()
    return {
      rowIndex: Math.round((centerY - firstRowY) / spacingMm),
      segment: {
        points: ascending,
        xStart: Math.min(rotatedStartX, rotatedEndX),
        xEnd: Math.max(rotatedStartX, rotatedEndX),
      },
    }
  })

  withRowInfo.sort(
    (a, b) => a.rowIndex - b.rowIndex || a.segment.xStart - b.segment.xStart,
  )

  const rows: HatchRow[] = []
  for (const w of withRowInfo) {
    const last = rows.at(-1)
    if (last && last.rowIndex === w.rowIndex) last.segments.push(w.segment)
    else rows.push({ rowIndex: w.rowIndex, segments: [w.segment] })
  }
  return rows
}

/** 行構造を捨てて全断片の点列を行番号順・行内x昇順のまま1次元に並べる(connect==='none'用) */
export function flattenHatchRows(rows: HatchRow[]): Point[][] {
  return rows.flatMap((row) => row.segments.map((s) => s.points))
}

/** 始点-終点の直線距離(ハッチ線・チェーンの「長さ」の基準として使う) */
function endpointDistance(points: Point[]): number {
  const a = points[0]
  const b = points.at(-1)!
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * connect==='none'/'boustrophedon'用: 接続前の個々のハッチ線から、始点-終点の直線距離が
 * minLengthMm未満のものを除外する。除外後に断片が0本になった行は行自体を落とす
 */
export function filterHatchRowsByMinLength(
  rows: HatchRow[],
  minLengthMm: number,
): HatchRow[] {
  if (minLengthMm <= 0) return rows
  const result: HatchRow[] = []
  for (const row of rows) {
    const segments = row.segments.filter(
      (s) => endpointDistance(s.points) >= minLengthMm,
    )
    if (segments.length > 0) result.push({ ...row, segments })
  }
  return result
}

/**
 * connect==='zigzag'用: 接続済みのチェーンから、始点-終点の直線距離がminLengthMm未満のものを
 * 除外する(zigzagは行の端点だけを使って接続するため、個々のハッチ線ではなく接続結果に対して行う)
 */
export function filterChainsByMinLength(
  chains: Point[][],
  minLengthMm: number,
): Point[][] {
  if (minLengthMm <= 0) return chains
  return chains.filter((c) => endpointDistance(c) >= minLengthMm)
}
