import type { Point } from '../geometry/types'
import type {
  FillBlock,
  FillCandidate,
  FillGeometryError,
  FillSettings,
} from './types'
import { offsetPolygon, resolveFillPolygon } from './clipper'
import { resolveEffectiveFillSettings } from './overrides'
import {
  filterChainsByMinLength,
  filterHatchRowsByMinLength,
  flattenHatchRows,
  generateHatchLines,
} from './hatch/lines'
import {
  connectHatchRowsBoustrophedon,
  connectHatchRowsZigzag,
  orderHatchLinesAsChains,
} from './hatch/connect'
import { generateConcentricRings } from './concentric'
import { generateSpiralPath } from './spiral'
import { closeLoop } from '../geometry/polygon'

function describeError(_kind: FillGeometryError['kind']): string {
  return '塗りオフセットにより形状が崩壊しました(面積が0以下になりました)'
}

/** 1方向分のハッチを生成し、連結モードに応じたチェーン列にする */
function buildHatchChains(
  region: Point[][],
  angleDeg: number,
  settings: FillSettings,
): Point[][] {
  const rows = generateHatchLines(region, {
    angleDeg,
    spacingMm: settings.spacingMm,
    waveform: settings.waveform,
    waveAmplitudeMm: settings.waveAmplitudeMm,
    waveLengthMm: settings.waveLengthMm,
    waveSegmentsPerCycle: settings.waveSegmentsPerCycle,
  })

  switch (settings.connect) {
    case 'zigzag':
      // zigzagは行の端点だけを使って接続するため、個々のハッチ線ではなく
      // 全ハッチ線で接続した後の結果に対して最小長フィルタをかける
      return filterChainsByMinLength(
        connectHatchRowsZigzag(rows, region),
        settings.minHatchLineLengthMm,
      )
    case 'boustrophedon': {
      // 往復は接続前に短いハッチ線を除外してから接続する
      const filteredRows = filterHatchRowsByMinLength(
        rows,
        settings.minHatchLineLengthMm,
      )
      return connectHatchRowsBoustrophedon(
        filteredRows,
        region,
        settings.spacingMm * settings.connectDistanceFactor,
      )
    }
    default: {
      // 連結しない場合も、短いハッチ線を除外してから訪問順序・向きだけを最適化する
      const filteredRows = filterHatchRowsByMinLength(
        rows,
        settings.minHatchLineLengthMm,
      )
      return orderHatchLinesAsChains(flattenHatchRows(filteredRows))
    }
  }
}

function buildChains(region: Point[][], settings: FillSettings): Point[][] {
  switch (settings.pattern) {
    case 'offset':
      return settings.offsetSpiralMode
        ? generateSpiralPath(region, settings.spacingMm, settings.drawOutline)
        : generateConcentricRings(
            region,
            settings.spacingMm,
            settings.drawOutline,
          )
    default: {
      // クロスハッチは方向ごとに独立して連結する(方向をまたいだ連結はしない)
      const angles = settings.crossHatch
        ? [settings.angleDeg, settings.crossAngleDeg]
        : [settings.angleDeg]
      return angles.flatMap((angleDeg) =>
        buildHatchChains(region, angleDeg, settings),
      )
    }
  }
}

/**
 * FR-16〜FR-21: fill候補1つを、輪郭解決→オフセット→塗り線生成→輪郭線という一連の処理にかけ、
 * 1つの塗りブロック(FR-22)にまとめる。
 *
 * 輪郭線描画(FR-21)はpatternの有効/無効と独立した機能であり、patternに関わらず
 * drawOutline設定だけに従う。ただしオフセット方式(同心・スパイラルとも)は最も外側のリングが
 * 輪郭そのものなので、drawOutline=trueのときは二重描画を避けてそのリングを生成しない
 * (buildChains参照)。
 */
function buildFillBlock(
  candidate: FillCandidate,
  settings: FillSettings,
): FillBlock {
  const resolved = resolveFillPolygon(candidate)
  const outlineLoops = settings.drawOutline ? resolved.map(closeLoop) : null

  // pattern==='none'は塗り線を生成しないため、オフセット処理自体を行わずに済ませる
  // (塗り線を作らなければオフセットの形状破綻エラーも起こり得ない)
  if (settings.pattern === 'none') {
    return {
      id: candidate.id,
      sourceId: candidate.sourceId,
      color: candidate.fillColor,
      outlineLoops,
      fillChains: [],
    }
  }

  const offsetResult = offsetPolygon(resolved, settings.fillOffsetMm)

  if ('error' in offsetResult) {
    return {
      id: candidate.id,
      sourceId: candidate.sourceId,
      color: candidate.fillColor,
      outlineLoops,
      fillChains: [],
      error: {
        fillBlockId: candidate.id,
        sourceId: candidate.sourceId,
        kind: offsetResult.error,
        message: describeError(offsetResult.error),
      },
    }
  }

  const region = offsetResult.paths
  const fillChains = buildChains(region, settings)

  return {
    id: candidate.id,
    sourceId: candidate.sourceId,
    color: candidate.fillColor,
    outlineLoops,
    fillChains,
  }
}

/**
 * fillごとの個別上書きを解決してから塗りブロックを生成する。グローバルのpattern='none'でも
 * 個別上書きでpatternを'none'以外にしたcandidateはそのfillだけ生成する
 */
export function buildFillBlocks(
  candidates: FillCandidate[],
  settings: FillSettings,
  overrides: Map<string, Partial<FillSettings>>,
): FillBlock[] {
  return candidates.flatMap((candidate) => {
    const effective = resolveEffectiveFillSettings(
      settings,
      overrides.get(candidate.id),
    )
    if (effective.pattern === 'none' && !effective.drawOutline) return []
    return [buildFillBlock(candidate, effective)]
  })
}
