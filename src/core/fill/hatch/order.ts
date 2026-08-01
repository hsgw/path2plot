import type { HatchRow, HatchSegment } from './lines'

/** 行構造を潰した断片1つ。連結処理はこの並び(標準順)を起点に進む */
export interface FlatSegment {
  rowIndex: number
  segment: HatchSegment
}

/** 回転空間のx範囲が重なるか(接触のみは重なりとみなさない) */
export function overlaps(a: HatchSegment, b: HatchSegment): boolean {
  return Math.min(a.xEnd, b.xEnd) - Math.max(a.xStart, b.xStart) > 0
}

function flatten(rows: HatchRow[]): FlatSegment[] {
  return rows.flatMap((row) =>
    row.segments.map((segment) => ({ rowIndex: row.rowIndex, segment })),
  )
}

/**
 * 断片を「縦に連なった柱」(boustrophedon cell decomposition のセルに相当)へ分解し、
 * 柱ごとに連結した1本の配列として返す。
 *
 * 隣接行の断片同士が回転空間のx範囲で重なり、かつその対応が1対1のときだけ連結し、
 * 分岐(1つの断片が次の行の2つ以上に重なる)・合流が起きる位置で柱を切る。
 * ジグザグは1つの断片から端点を1つしか使わないため、この分解を行わないと穴の反対側の断片が
 * 描き残される。単純な連結成分(Union-Find)ではドーナツが上下でつながって1グループになり
 * 分解にならないため、1対1の対応であることを条件にしている。
 */
export function orderByColumn(rows: HatchRow[]): FlatSegment[] {
  const flat = flatten(rows)
  const n = flat.length
  const next = new Array<number>(n).fill(-1)
  const prev = new Array<number>(n).fill(-1)

  // flatはrowsの並び(行番号昇順・行内x昇順)そのままなので、行ごとの範囲を順に切り出せる
  const rowRanges: { rowIndex: number; from: number; to: number }[] = []
  let cursor = 0
  for (const row of rows) {
    rowRanges.push({
      rowIndex: row.rowIndex,
      from: cursor,
      to: cursor + row.segments.length,
    })
    cursor += row.segments.length
  }

  for (let r = 0; r + 1 < rowRanges.length; r++) {
    const cur = rowRanges[r]
    const nxt = rowRanges[r + 1]
    // 間に空の行が挟まっている(行番号が飛んでいる)なら材料が途切れているので連結しない
    if (nxt.rowIndex - cur.rowIndex !== 1) continue

    for (let i = cur.from; i < cur.to; i++) {
      let matched = -1
      let forwardCount = 0
      for (let j = nxt.from; j < nxt.to; j++) {
        if (overlaps(flat[i].segment, flat[j].segment)) {
          matched = j
          forwardCount++
        }
      }
      if (forwardCount !== 1) continue

      let backwardCount = 0
      for (let k = cur.from; k < cur.to; k++) {
        if (overlaps(flat[k].segment, flat[matched].segment)) backwardCount++
      }
      if (backwardCount !== 1) continue

      next[i] = matched
      prev[matched] = i
    }
  }

  const ordered: FlatSegment[] = []
  for (let i = 0; i < n; i++) {
    if (prev[i] !== -1) continue
    for (let k = i; k !== -1; k = next[k]) ordered.push(flat[k])
  }
  return ordered
}

/**
 * 往復の標準順: 行番号昇順に辿り、偶数行は左→右、奇数行は右→左に向きを揃える。
 * 接続が常に「同じ側の端点同士」になるため距離が予測可能になる。
 * 行が穴で分断されている場合は、行内の断片も同じ向きの順序で消費する。
 */
export function orderByRow(rows: HatchRow[]): FlatSegment[] {
  return rows.flatMap((row) => {
    const segments = isForwardRow(row.rowIndex)
      ? row.segments
      : [...row.segments].reverse()
    return segments.map((segment) => ({ rowIndex: row.rowIndex, segment }))
  })
}

/** 往復で行を左→右に辿る行かどうか(行番号は負にもなりうるため剰余を正に正規化する) */
export function isForwardRow(rowIndex: number): boolean {
  return ((rowIndex % 2) + 2) % 2 === 0
}
