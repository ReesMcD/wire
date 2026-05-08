/**
 * Quantile matching aligns each non-KTC source's raw scores to KTC's empirical distribution per
 * format lane (dynasty / redraft), then max-rescales the result to 0–9999 within the lane. KTC rows
 * store QM == max-scale norm (KTC is the reference, so it doesn't need re-mapping).
 *
 * Currently aligned to KTC: FantasyCalc (FC), Dynasty Daddy (DD/ADP Daddy).
 *
 * Edge cases:
 * - Empty intersection (only source X or only KTC in a lane): X uses raw `value` in the lane max
 *   step; QM still lands on 0–9999. Old rows without `normalizedValueQm` fall back to Max norms in
 *   the UI until the next full merge.
 * - Picks: included whenever both sources emit the same `pick:…` sleeperId.
 * - Tiers in DB remain max-scale only; Rankings tier columns unchanged when Scale = Quantile.
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

/** Map any source's raw `value` rows to KTC's empirical distribution within a lane, then
 *  max-rescale to 0–9999. KTC's own QM stays equal to its `normalizedValue` (the reference). */
function stampLaneQm(
  rows: PlayerValue[],
  sourceIds: Set<string>,
  ktcIds: Set<string>,
  qmById: Map<string, number | null>,
): void {
  const srcBySid = new Map<string, PlayerValue>()
  const ktcBySid = new Map<string, PlayerValue>()
  for (const v of rows) {
    if (sourceIds.has(v.sourceId)) srcBySid.set(v.sleeperId, v)
    if (ktcIds.has(v.sourceId)) ktcBySid.set(v.sleeperId, v)
  }

  const intersection = [...srcBySid.keys()].filter((id) => ktcBySid.has(id))

  let srcSorted: number[] = []
  let ktcSorted: number[] = []
  if (intersection.length > 0) {
    srcSorted = intersection
      .map((id) => srcBySid.get(id)!.value)
      .slice()
      .sort((a, b) => a - b)
    ktcSorted = intersection
      .map((id) => ktcBySid.get(id)!.value)
      .slice()
      .sort((a, b) => a - b)
  }

  const mappedRawBySid = new Map<string, number>()
  for (const id of intersection) {
    const srcRow = srcBySid.get(id)!
    mappedRawBySid.set(id, mapFcRawToKtcQuantile(srcRow.value, srcSorted, ktcSorted))
  }

  let maxMapped = 0
  for (const v of rows) {
    if (!sourceIds.has(v.sourceId)) continue
    const mr = mappedRawBySid.has(v.sleeperId)
      ? mappedRawBySid.get(v.sleeperId)!
      : v.value
    maxMapped = Math.max(maxMapped, mr)
  }

  for (const v of rows) {
    if (sourceIds.has(v.sourceId)) {
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

/**
 * Each non-KTC source's raw values are mapped onto KTC's empirical distribution per format lane
 * (quantile alignment), then max-rescaled to 0–9999 within the lane. KTC rows use
 * `normalizedValue` as QM (reference). Sources covered: FantasyCalc, Dynasty Daddy.
 * Source-only assets without a KTC counterpart: QM falls back to max-scale behavior using raw
 * `value` in the lane max step.
 */
export function applyQuantileMatchedNorms(values: PlayerValue[]): PlayerValue[] {
  const qmById = new Map<string, number | null>()

  stampLaneQm(values, FC_DYNASTY_IDS, KTC_DYNASTY_IDS, qmById)
  stampLaneQm(values, FC_REDRAFT_IDS, KTC_REDRAFT_IDS, qmById)
  stampLaneQm(values, DD_DYNASTY_IDS, KTC_DYNASTY_IDS, qmById)
  stampLaneQm(values, DD_REDRAFT_IDS, KTC_REDRAFT_IDS, qmById)

  return values.map((v) => ({
    ...v,
    normalizedValueQm: qmById.has(v.id) ? qmById.get(v.id)! : null,
  }))
}
