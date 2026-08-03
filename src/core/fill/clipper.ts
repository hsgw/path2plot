import {
  ClipType,
  ClipperD,
  EndType,
  FillRule as ClipperFillRule,
  JoinType,
  areaPathsD,
  inflatePathsD,
  unionD,
  type PathsD,
} from 'clipper2-ts'
import type { Point } from '../geometry/types'
import type { FillCandidate } from './types'
import type { FillRule } from '../svg/types'

/**
 * clipper2-tsの内部整数スケーリングに使う小数桁数。mm単位の座標に対し0.1umまで保持すれば
 * 実用上十分な精度であり、かつ極端な値によるオーバーフローの余地もない。
 * このファイルがclipper2-tsをimportする唯一の場所(将来のライブラリ差し替え用のシーム)。
 * 幾何判定側の許容誤差(core/geometry/tolerance.ts)は、この精度による丸めを吸収する値にしてある。
 */
const PRECISION = 4

function toClipperFillRule(rule: FillRule): ClipperFillRule {
  return rule === 'evenodd' ? ClipperFillRule.EvenOdd : ClipperFillRule.NonZero
}

/**
 * FR-16: 1要素分の閉subpath群(穴・外形混在、未解決)を、fillRule指定でUnionし、
 * 穴/外形が正規化された単純ポリゴン集合を得る。穴/外形の判定はClipperのブーリアン演算に
 * 委譲し、自前のnesting depth計算は行わない。
 */
export function resolveFillPolygon(candidate: FillCandidate): Point[][] {
  return unionD(
    candidate.contours as PathsD,
    [] as PathsD,
    toClipperFillRule(candidate.fillRule),
    PRECISION,
  )
}

/**
 * FR-20: 塗りオフセット。offsetMmは「正の値=内側へ縮小」というmm側の慣習(Clipperのdelta引数とは
 * 符号が逆で、Clipperは正の値=外側へ拡大)。round join・Polygon終端(閉パス前提)で処理する。
 * 正のoffsetMmでは外形は縮み穴は広がる(材料側から見てどちらの境界も内側へ後退するため)。
 * 負のoffsetMmではその逆(外形が広がり穴は縮む。穴が縮みきって消えても輪郭数が減るだけなので
 * エラーではない)。括れのある形状が複数の島へ分裂するのも、insetPolygonRawと同様に正常な結果
 * として素通しする(塗り生成側は複数の島・穴を1つの領域として扱える)。面積0以下に潰れた場合のみ
 * エラーとして検出する。
 */
export function offsetPolygon(
  paths: Point[][],
  offsetMm: number,
): { paths: Point[][] } | { error: 'collapsed' } {
  const result = inflatePathsD(
    paths as PathsD,
    -offsetMm,
    JoinType.Round,
    EndType.Polygon,
    2.0,
    PRECISION,
  )

  if (result.length === 0 || areaPathsD(result) <= 0) {
    return { error: 'collapsed' }
  }
  return { paths: result }
}

/**
 * エラー判定を伴わない素の内側オフセット(insetMmが正で内側へ縮小)。
 * 同心オフセット塗り・スパイラル塗りのリング生成用。内側へ掘り進めば形状が複数へ分裂したり
 * 消滅したりするのは当然の結果なので、offsetPolygonのような破綻判定は行わず素通しする。
 */
export function insetPolygonRaw(paths: Point[][], insetMm: number): Point[][] {
  if (paths.length === 0) return []
  return inflatePathsD(
    paths as PathsD,
    -insetMm,
    JoinType.Round,
    EndType.Polygon,
    2.0,
    PRECISION,
  )
}

/**
 * FR-17/19: ハッチ候補線(開放パス)を、塗り領域の輪郭(閉パス)でクリップする。
 * 1回のClipper呼び出しに全候補線をまとめて渡すことで、行ごとに呼び出す場合よりコストを抑える。
 */
export function clipOpenLinesToPolygon(
  lines: Point[][],
  clipPaths: Point[][],
): Point[][] {
  const clipper = new ClipperD(PRECISION)
  clipper.addOpenSubjectPaths(lines as PathsD)
  clipper.addClipPaths(clipPaths as PathsD)
  const solutionClosed: PathsD = []
  const solutionOpen: PathsD = []
  clipper.execute(
    ClipType.Intersection,
    ClipperFillRule.NonZero,
    solutionClosed,
    solutionOpen,
  )
  return solutionOpen
}
