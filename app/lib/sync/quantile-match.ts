/**
 * Quantile matching aligns FC raw scores to KTC’s empirical distribution per format lane (dynasty /
 * redraft), then max-rescales FC to 0–9999 within the lane. KTC rows store QM == max-scale norm.
 *
 * Edge cases:
 * - Empty intersection (only FC or only KTC in a lane): FC uses raw `value` in the lane max step;
 *   QM still lands on 0–9999. Old rows without `normalizedValueQm` until next full merge fall back to Max
 *   norms in the UI.
 * - Picks: included whenever both sources emit the same `pick:…` sleeperId.
 * - Dynasty Daddy / ADP Daddy: QM equals max-scale `normalizedValue` (no FC-style quantile map).
 * - Tiers in DB remain max-scale only; Rankings tier columns unchanged when Scale = Quantile (see UI copy).
 */
import type { PlayerValue } from '@/lib/db/schema'
import {
  LEGACY_FC,
  LEGACY_KTC,
  SOURCE_FC_DYNASTY,
  SOURCE_FC_REDRAFT,
  SOURCE_KTC_DYNASTY,
  SOURCE_KTC_REDRAFT,
  SOURCE_DD_DYNASTY,
  SOURCE_DD_REDRAFT,
} from '@/lib/sync/tiering'

const FC_DYNASTY_IDS = new Set([SOURCE_FC_DYNASTY, LEGACY_FC])
const KTC_DYNASTY_IDS = new Set([SOURCE_KTC_DYNASTY, LEGACY_KTC])
const FC_REDRAFT_IDS = new Set([SOURCE_FC_REDRAFT])
const KTC_REDRAFT_IDS = new Set([SOURCE_KTC_REDRAFT])
const DD_DYNASTY_IDS = new Set([SOURCE_DD_DYNASTY])
const DD_REDRAFT_IDS = new Set([SOURCE_DD_REDRAFT])

/** Linear interpolation on sorted ascending values; p in [0, 1]. */
function sortedQuantile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  if (sortedAsc.length === 1) return sortedAsc[0]
  const clamped = Math.max(0, Math.min(1, p))
  const idx = clamped * (sortedAsc.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const w = idx - lo
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w
}

/** Mid-rank percentile of x in sorted ascending multiset (ties share rank). */
function midRankPercentile(x: number, sortedAsc: number[]): number {
  const n = sortedAsc.length
  if (n === 0) return 0.5
  let lt = 0
  let eq = 0
  for (const v of sortedAsc) {
    if (v < x) lt++
    else if (v === x) eq++
  }
  const rank = lt + (eq + 1) / 2
  return (rank - 0.5) / n
}

function mapFcRawToKtcQuantile(fcRaw: number, fcSorted: number[], ktcSorted: number[]): number {
  if (fcSorted.length === 0 || ktcSorted.length === 0) return fcRaw
  const p = midRankPercentile(fcRaw, fcSorted)
  return sortedQuantile(ktcSorted, p)
}

function stampLaneQm(
  rows: PlayerValue[],
  fcIds: Set<string>,
  ktcIds: Set<string>,
  qmById: Map<string, number | null>,
): void {
  const fcBySid = new Map<string, PlayerValue>()
  const ktcBySid = new Map<string, PlayerValue>()
  for (const v of rows) {
    if (fcIds.has(v.sourceId)) fcBySid.set(v.sleeperId, v)
    if (ktcIds.has(v.sourceId)) ktcBySid.set(v.sleeperId, v)
  }

  const intersection = [...fcBySid.keys()].filter((id) => ktcBySid.has(id))

  let fcSorted: number[] = []
  let ktcSorted: number[] = []
  if (intersection.length > 0) {
    fcSorted = intersection
      .map((id) => fcBySid.get(id)!.value)
      .slice()
      .sort((a, b) => a - b)
    ktcSorted = intersection
      .map((id) => ktcBySid.get(id)!.value)
      .slice()
      .sort((a, b) => a - b)
  }

  const mappedRawBySid = new Map<string, number>()
  for (const id of intersection) {
    const fcRow = fcBySid.get(id)!
    mappedRawBySid.set(id, mapFcRawToKtcQuantile(fcRow.value, fcSorted, ktcSorted))
  }

  let maxMapped = 0
  for (const v of rows) {
    if (!fcIds.has(v.sourceId)) continue
    const mr = mappedRawBySid.has(v.sleeperId)
      ? mappedRawBySid.get(v.sleeperId)!
      : v.value
    maxMapped = Math.max(maxMapped, mr)
  }

  for (const v of rows) {
    if (fcIds.has(v.sourceId)) {
      const mr = mappedRawBySid.has(v.sleeperId)
        ? mappedRawBySid.get(v.sleeperId)!
        : v.value
      const qm = maxMapped > 0 ? Math.round((mr / maxMapped) * 9999) : 0
      qmById.set(v.id, qm)
    } else if (ktcIds.has(v.sourceId)) {
      qmById.set(v.id, v.normalizedValue)
    }
  }
}

/** DD / ADP rows: quantile mode uses the same scale as Max (reference lane is FC↔KTC only). */
function stampDdQm(rows: PlayerValue[], qmById: Map<string, number | null>): void {
  for (const v of rows) {
    if (DD_DYNASTY_IDS.has(v.sourceId) || DD_REDRAFT_IDS.has(v.sourceId)) {
      qmById.set(v.id, v.normalizedValue)
    }
  }
}

/**
 * FC raw values are mapped onto KTC’s empirical distribution per format lane (quantile alignment),
 * then max-rescaled to 0–9999 within the lane. KTC rows use `normalizedValue` as QM (reference).
 * FC/KTC-only assets (no overlap): QM falls back to max-scale behavior using raw `value` in the
 * lane max step (same as intersection mapping using raw fallback above).
 */
export function applyQuantileMatchedNorms(values: PlayerValue[]): PlayerValue[] {
  const qmById = new Map<string, number | null>()

  stampLaneQm(values, FC_DYNASTY_IDS, KTC_DYNASTY_IDS, qmById)
  stampLaneQm(values, FC_REDRAFT_IDS, KTC_REDRAFT_IDS, qmById)
  stampDdQm(values, qmById)

  return values.map((v) => ({
    ...v,
    normalizedValueQm: qmById.has(v.id) ? qmById.get(v.id)! : null,
  }))
}
