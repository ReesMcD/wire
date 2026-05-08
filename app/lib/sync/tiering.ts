import type { PlayerValue } from '@/lib/db/schema'

export interface TieringConfig {
  minAbsoluteGap?: number
  minRelativeGap?: number
}

const DEFAULT_CONFIG: Required<TieringConfig> = {
  minAbsoluteGap: 140,
  minRelativeGap: 0.028,
}

/** Composite source ids + legacy rows treated as dynasty */
export const SOURCE_FC_DYNASTY = 'fantasycalc_dynasty'
export const SOURCE_FC_REDRAFT = 'fantasycalc_redraft'
export const SOURCE_KTC_DYNASTY = 'ktc_dynasty'
export const SOURCE_KTC_REDRAFT = 'ktc_redraft'
export const SOURCE_DD_DYNASTY = 'dynasty_daddy_dynasty'
export const SOURCE_DD_REDRAFT = 'dynasty_daddy_redraft'
export const LEGACY_FC = 'fantasycalc'
export const LEGACY_KTC = 'ktc'

export const FC_DYNASTY_IDS = new Set([SOURCE_FC_DYNASTY, LEGACY_FC])
export const KTC_DYNASTY_IDS = new Set([SOURCE_KTC_DYNASTY, LEGACY_KTC])
export const DD_DYNASTY_IDS = new Set([SOURCE_DD_DYNASTY])
export const FC_REDRAFT_IDS = new Set([SOURCE_FC_REDRAFT])
export const KTC_REDRAFT_IDS = new Set([SOURCE_KTC_REDRAFT])
export const DD_REDRAFT_IDS = new Set([SOURCE_DD_REDRAFT])

export function computeTierMap(
  values: PlayerValue[],
  config: TieringConfig = {},
): Map<string, number> {
  const { minAbsoluteGap, minRelativeGap } = { ...DEFAULT_CONFIG, ...config }
  const map = new Map<string, number>()

  if (values.length === 0) return map

  const sorted = [...values].sort((a, b) => b.normalizedValue - a.normalizedValue)

  let currentTier = 1
  map.set(sorted[0].sleeperId, currentTier)

  for (let i = 1; i < sorted.length; i++) {
    const prevNorm = sorted[i - 1].normalizedValue
    const currNorm = sorted[i].normalizedValue
    const gap = prevNorm - currNorm

    const relativeBar = prevNorm > 0 ? prevNorm * minRelativeGap : 0
    const threshold = Math.max(minAbsoluteGap, relativeBar)

    if (gap >= threshold) {
      currentTier++
    }

    map.set(sorted[i].sleeperId, currentTier)
  }

  return map
}

/** Picks (`pick:…` ids) get their own tier ladder; players get a separate one (same gap rules). */
function computeTierMapSplit(
  values: PlayerValue[],
  config: TieringConfig = {},
): Map<string, number> {
  const picks = values.filter((v) => v.sleeperId.startsWith('pick:'))
  const players = values.filter((v) => !v.sleeperId.startsWith('pick:'))
  const map = new Map<string, number>()
  for (const [k, v] of computeTierMap(picks, config)) map.set(k, v)
  for (const [k, v] of computeTierMap(players, config)) map.set(k, v)
  return map
}

function stampTierMultiForLane(
  values: PlayerValue[],
  fcIds: Set<string>,
  ktcIds: Set<string>,
  ddIds: Set<string>,
): PlayerValue[] {
  const laneRows = values.filter(
    (v) => fcIds.has(v.sourceId) || ktcIds.has(v.sourceId) || ddIds.has(v.sourceId),
  )
  if (laneRows.length === 0) return values

  const fcRows = laneRows.filter((v) => fcIds.has(v.sourceId))
  const ktcRows = laneRows.filter((v) => ktcIds.has(v.sourceId))
  const ddRows = laneRows.filter((v) => ddIds.has(v.sourceId))

  const tierFcMap = computeTierMapSplit(fcRows)
  const tierKtcMap = computeTierMapSplit(ktcRows)
  const tierDdMap = computeTierMapSplit(ddRows)

  const normAccum = new Map<string, { fc?: number; ktc?: number; dd?: number }>()
  for (const v of laneRows) {
    const acc = normAccum.get(v.sleeperId) ?? {}
    if (fcIds.has(v.sourceId)) acc.fc = v.normalizedValue
    if (ktcIds.has(v.sourceId)) acc.ktc = v.normalizedValue
    if (ddIds.has(v.sourceId)) acc.dd = v.normalizedValue
    normAccum.set(v.sleeperId, acc)
  }

  const avgRows: PlayerValue[] = []
  for (const [sleeperId, n] of normAccum) {
    const parts = [n.fc, n.ktc, n.dd].filter((x): x is number => x !== undefined)
    const avgNorm =
      parts.length > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0
    avgRows.push({
      id: `__avg__:${sleeperId}`,
      sleeperId,
      sourceId: '__avg__',
      value: 0,
      normalizedValue: avgNorm,
      normalizedValueQm: null,
      overallRank: null,
      positionRank: null,
      trend: null,
      tierAvg: null,
      tierFc: null,
      tierKtc: null,
      tierDd: null,
      updatedAt: '',
    })
  }

  const tierAvgMap = computeTierMapSplit(avgRows)

  return values.map((row) => {
    if (!fcIds.has(row.sourceId) && !ktcIds.has(row.sourceId) && !ddIds.has(row.sourceId)) {
      return row
    }
    return {
      ...row,
      tierAvg: tierAvgMap.get(row.sleeperId) ?? null,
      tierFc: tierFcMap.get(row.sleeperId) ?? null,
      tierKtc: tierKtcMap.get(row.sleeperId) ?? null,
      tierDd: tierDdMap.get(row.sleeperId) ?? null,
    }
  })
}

/**
 * Assigns tierAvg / tierFc / tierKtc / tierDd per format lane (dynasty vs redraft).
 * Legacy `fantasycalc` / `ktc` rows are treated as dynasty.
 * `tierAvg` uses the mean of available normalized values (FC, KTC, DD) per sleeper in the lane.
 */
export function assignTierDimensions(values: PlayerValue[]): PlayerValue[] {
  if (values.length === 0) return values

  let out = stampTierMultiForLane(values, FC_DYNASTY_IDS, KTC_DYNASTY_IDS, DD_DYNASTY_IDS)
  out = stampTierMultiForLane(out, FC_REDRAFT_IDS, KTC_REDRAFT_IDS, DD_REDRAFT_IDS)
  return out
}
