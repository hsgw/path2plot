import type { Point } from '../types/geometry'

/**
 * 判定の許容誤差(mm)。ハッチ線の端点はclipper2-tsの内部精度(fillPolygon.tsのPRECISION=4、
 * すなわち1e-4mm)で丸められており、輪郭のごくわずか外側に出ている場合があるため、
 * それを上回る値を取って誤判定(本来内側の接続を外側と判定してしまう)を防ぐ。
 * 1e-3mmはプロッタの描画分解能から見れば無視できる大きさ。
 */
const EPS_MM = 1e-3

function crossesProperly(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
  tEps: number,
): boolean {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const denom = rx * sy - ry * sx
  // 平行・共線: 輪郭に沿って重なるだけなので外側へは出ない(交差として扱わない)
  if (denom === 0) return false

  const qpx = c.x - a.x
  const qpy = c.y - a.y
  const t = (qpx * sy - qpy * sx) / denom
  const u = (qpx * ry - qpy * rx) / denom
  // t側は端点近傍(tEps)を除外する。ハッチ線の端点はもともと輪郭上にあり、
  // 丸め誤差の範囲で輪郭と交差しうるため。u側は頂点を通り抜けるケースを
  // 見逃さないよう両端を含める(安全側=接続しない側に倒す)。
  return t > tEps && t < 1 - tEps && u >= 0 && u <= 1
}

function distSqToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const cx = a.x + t * dx - p.x
  const cy = a.y + t * dy - p.y
  return cx * cx + cy * cy
}

/**
 * 点がポリゴン集合の内側かをray casting(even-odd)で判定する。
 * pathsはClipperが正規化した「外形と穴が重なり合わない閉ループ群」を前提とするため、
 * 外形の中かつ穴の中(=交差数2)は正しく外側と判定される。各ループは暗黙的に閉じているものとして扱う。
 */
export function isPointInsidePolygon(p: Point, paths: Point[][]): boolean {
  let inside = false
  for (const path of paths) {
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const a = path[i]
      const b = path[j]
      if (
        a.y > p.y !== b.y > p.y &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      ) {
        inside = !inside
      }
    }
  }
  return inside
}

/**
 * 線分a→bが、塗り領域(外形+穴のポリゴン集合)からはみ出さずに引けるかを判定する。
 * 輪郭のどの辺とも(端点近傍を除いて)交差しなければ、線分全体は境界のどちら側か一方に
 * 収まっているため、中点の内外判定だけで全体の内外が決まる。
 * 中点が境界上(誤差EPS_MM以内)の場合は輪郭に沿った線分とみなして内側扱いにする。
 */
export function isSegmentInsidePolygon(
  a: Point,
  b: Point,
  paths: Point[][],
): boolean {
  if (paths.length === 0) return false

  const length = Math.hypot(b.x - a.x, b.y - a.y)
  // 実質同一点(ペン移動を伴わない)なので、はみ出しは起こりえない
  if (length <= EPS_MM) return true

  const tEps = EPS_MM / length
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const epsSq = EPS_MM * EPS_MM
  let midOnBoundary = false

  for (const path of paths) {
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const e0 = path[j]
      const e1 = path[i]
      if (crossesProperly(a, b, e0, e1, tEps)) return false
      if (!midOnBoundary && distSqToSegment(mid, e0, e1) <= epsSq) {
        midOnBoundary = true
      }
    }
  }

  return midOnBoundary || isPointInsidePolygon(mid, paths)
}
