import type { AggregatedPlayer } from '@/lib/rankings/player-metrics'
import type { MetricLane } from '@/lib/rankings/league-board-power-input'

export type ConsensusThresholdMode = 'rank' | 'percentile' | 'sign'

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

function laneRanks(p: AggregatedPlayer, lane: MetricLane) {
  const fcR = lane === 'dynasty' ? p.dynFcRank : p.rdFcRank
  const ktcR = lane === 'dynasty' ? p.dynKtcRank : p.rdKtcRank
  const ddR = lane === 'dynasty' ? p.dynDdRank : p.rdDdRank
  return { fcR, ktcR, ddR }
}

/**
 * Rank gaps: (sourceRank - ktcRank). Lower rank # = better player. If FC values the player higher
 * than KTC (positive norm Δ), FC rank should be better than KTC → gapFc < 0.
 */
export function rankGapsVsKtc(p: AggregatedPlayer, lane: MetricLane): { gapFc: number; gapDd: number } | null {
  const { fcR, ktcR, ddR } = laneRanks(p, lane)
  if (fcR == null || ktcR == null || ddR == null) return null
  return { gapFc: fcR - ktcR, gapDd: ddR - ktcR }
}

/**
 * Rank mode: same norm-sign agreement, rank gaps agree with that direction (gapFc * deltaFc < 0),
 * and min(|gapFc|, |gapDd|) ≥ minRankGap.
 */
export function passesConsensusRank(
  p: AggregatedPlayer,
  lane: MetricLane,
  deltaFc: number | null,
  deltaDd: number | null,
  minRankGap: number,
): boolean {
  if (!consensusNormSign(deltaFc, deltaDd)) return false
  const gaps = rankGapsVsKtc(p, lane)
  if (!gaps) return false
  const { gapFc, gapDd } = gaps
  if (deltaFc == null || deltaDd == null) return false
  // Rank direction must match norm direction (FC higher than KTC → negative gap)
  if (deltaFc * gapFc >= 0 || deltaDd * gapDd >= 0) return false
  if (Math.sign(gapFc) !== Math.sign(gapDd)) return false
  const mag = Math.min(Math.abs(gapFc), Math.abs(gapDd))
  return mag >= minRankGap
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
 * Sign mode: FC and DD norm deltas vs KTC are both positive or both negative (same direction),
 * and min(|Δ FC|, |Δ DD|) ≥ minNormDiff (0 = any non-zero agreement).
 */
export function passesConsensusSignMin(
  deltaFc: number | null | undefined,
  deltaDd: number | null | undefined,
  minNormDiff: number,
): boolean {
  if (!consensusNormSign(deltaFc, deltaDd)) return false
  if (deltaFc == null || deltaDd == null) return false
  const joint = Math.min(Math.abs(deltaFc), Math.abs(deltaDd))
  const floor = Math.max(0, minNormDiff)
  return joint >= floor
}

export function passesConsensusIndicator(
  p: AggregatedPlayer | null | undefined,
  lane: MetricLane,
  deltaFc: number | null | undefined,
  deltaDd: number | null | undefined,
  mode: ConsensusThresholdMode,
  rankMinGap: number,
  percentileCutoff: number | null,
  signMinNormDiff: number,
): boolean {
  if (deltaFc == null || deltaDd == null) return false
  if (mode === 'rank') {
    if (!p) return false
    return passesConsensusRank(p, lane, deltaFc, deltaDd, rankMinGap)
  }
  if (mode === 'percentile') {
    return passesConsensusPercentile(deltaFc, deltaDd, percentileCutoff)
  }
  return passesConsensusSignMin(deltaFc, deltaDd, signMinNormDiff)
}
