import type { AggregatedPlayer } from '@/lib/rankings/player-metrics'
import type { MetricLane } from '@/lib/rankings/league-board-power-input'

export type ConsensusThresholdMode = 'percentile' | 'agreement'

/** Same-sign, both non-zero: FC and DD disagree with KTC in the same direction (norm deltas). */
export function consensusNormSign(
  deltaFc: number | null | undefined,
  deltaDd: number | null | undefined,
): 'higher' | 'lower' | null {
  if (deltaFc == null || deltaDd == null) return null
  if (deltaFc === 0 || deltaDd === 0) return null
  if (deltaFc > 0 && deltaDd > 0) return 'higher'
  if (deltaFc < 0 && deltaDd < 0) return 'lower'
  return null
}

function laneDeltas(p: AggregatedPlayer, lane: MetricLane) {
  const dFc = lane === 'dynasty' ? p.dynDeltaNormFcVsKtc : p.rdDeltaNormFcVsKtc
  const dDd = lane === 'dynasty' ? p.dynDeltaNormDdVsKtc : p.rdDeltaNormDdVsKtc
  return { dFc, dDd }
}

/** Quantile of sorted ascending array at p in [0, 1] with linear interpolation. */
function quantileSorted(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  if (sortedAsc.length === 1) return sortedAsc[0]
  const clamped = Math.max(0, Math.min(1, p))
  const pos = (sortedAsc.length - 1) * clamped
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const w = pos - lo
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w
}

const MIN_SAMPLE_FOR_PERCENTILE_CUTOFF = 24

/**
 * Builds the distribution of min(|Δ FC|, |Δ DD|) over players (excluding picks) with both deltas
 * present. Returns the value at `percentile`/100 (e.g. 90 → top 10% joint disagreement magnitude).
 * Returns null if too few samples — callers should fall back to sign-only for percentile mode.
 */
export function computeMinAbsDeltaPercentileCutoff(
  players: AggregatedPlayer[],
  lane: MetricLane,
  percentile: number,
): number | null {
  const vals: number[] = []
  for (const p of players) {
    if (p.position === 'PICK' || p.sleeperId.startsWith('pick:')) continue
    const { dFc, dDd } = laneDeltas(p, lane)
    if (dFc == null || dDd == null) continue
    vals.push(Math.min(Math.abs(dFc), Math.abs(dDd)))
  }
  if (vals.length < MIN_SAMPLE_FOR_PERCENTILE_CUTOFF) return null
  vals.sort((a, b) => a - b)
  const p = Math.max(0, Math.min(100, percentile)) / 100
  return quantileSorted(vals, p)
}

/**
 * Percentile mode: same norm-sign + min(|Δ FC|, |Δ DD|) ≥ cutoff. If cutoff is null, only
 * same-sign is required (insufficient data for a stable percentile gate).
 */
export function passesConsensusPercentile(
  deltaFc: number | null,
  deltaDd: number | null,
  cutoff: number | null,
): boolean {
  if (!consensusNormSign(deltaFc, deltaDd)) return false
  if (deltaFc == null || deltaDd == null) return false
  const joint = Math.min(Math.abs(deltaFc), Math.abs(deltaDd))
  if (cutoff == null) return true
  return joint >= cutoff
}

/**
 * Agreement mode: same sign vs KTC on norm deltas, and **each** of |Δ FC| and |Δ DD| is at least `minEach`.
 * `minEach` 0 = any same-sign non-zero pair (direction agreement only).
 */
export function passesConsensusAgreement(
  deltaFc: number | null | undefined,
  deltaDd: number | null | undefined,
  minEach: number,
): boolean {
  if (!consensusNormSign(deltaFc, deltaDd)) return false
  if (deltaFc == null || deltaDd == null) return false
  const floor = Math.max(0, minEach)
  if (floor === 0) return true
  return Math.abs(deltaFc) >= floor && Math.abs(deltaDd) >= floor
}

export function passesConsensusIndicator(
  deltaFc: number | null | undefined,
  deltaDd: number | null | undefined,
  mode: ConsensusThresholdMode,
  percentileCutoff: number | null,
  agreementMinEach: number,
): boolean {
  if (deltaFc == null || deltaDd == null) return false
  if (mode === 'percentile') {
    return passesConsensusPercentile(deltaFc, deltaDd, percentileCutoff)
  }
  return passesConsensusAgreement(deltaFc, deltaDd, agreementMinEach)
}
