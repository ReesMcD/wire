import type { MetricLane, DepthTier } from '@/lib/rankings/league-board-power-input'
import type { NormMode } from '@/lib/rankings/player-metrics'
import type { ConsensusThresholdMode } from '@/lib/rankings/consensus-threshold'
import type {
  PowerMode,
  ScoreDisplay,
  TierIncludes,
} from '@/lib/stores/ui-settings'

/** Plain-English summary of which players are in the pool. */
export function poolLabel(tierIncludes: TierIncludes): string {
  const parts: string[] = []
  if (tierIncludes.starter) parts.push('starters')
  if (tierIncludes.backup) parts.push('backups')
  if (tierIncludes.bench) parts.push('bench')
  return parts.length ? parts.join(' + ') : 'none (empty pool)'
}

export function laneLabel(lane: MetricLane): string {
  return lane === 'dynasty' ? 'Dynasty' : 'Redraft'
}

export function explainLane(lane: MetricLane): string {
  return lane === 'dynasty'
    ? 'Dynasty: long-term values across multi-year leagues. Picks count.'
    : 'Redraft: single-season values; picks and rookies are weighted differently.'
}

export function explainNormMode(normMode: NormMode): string {
  if (normMode === 'quantile') {
    return [
      'Quantile (current): rank each source independently, then map FantasyCalc and DD onto KTC at the same percentile.',
      'Effect: a player at the 80th-percentile of FC ≈ a player at the 80th-percentile of KTC, regardless of raw scale.',
      'Best when comparing across sources directly.',
    ].join(' ')
  }
  return [
    'Max (current): for each source, raw value ÷ that source\'s max × 9999.',
    'Effect: each source kept on its own scale; cross-source comparisons can be skewed if their raw distributions differ.',
    'Useful as a sanity check against the raw numbers.',
  ].join(' ')
}

export function explainScoreDisplay(scoreDisplay: ScoreDisplay): string {
  if (scoreDisplay === 'max9999') {
    return 'Max 9999 (current): team total ÷ league max × 9999. Best team in the league = 9999.'
  }
  if (scoreDisplay === 'ordinal') {
    return 'Ordinal rank (current): #1 = best team, ties share the same rank.'
  }
  return 'Percentile 1–99 (current): mid-rank percentile spaced evenly across all teams.'
}

export function explainTierToggle(tier: DepthTier): string {
  if (tier === 'starter') {
    return 'Starter: top 2 QB, 3 RB, 3 WR, 1 TE by avg-norm (value-optimal superflex). Toggle to include or exclude starters from the pool.'
  }
  if (tier === 'backup') {
    return 'Backup: next 1 QB, 2 RB, 2 WR, 1 TE after starters. Toggle to include or exclude backups from the pool.'
  }
  return 'Bench: anything past the starter+backup slots, plus non-skill positions. Toggle to include or exclude bench from the pool.'
}

export function explainPowerMode(
  powerMode: PowerMode,
  tierIncludes: TierIncludes,
  depthWeights: Record<DepthTier, number>,
): string {
  const pool = poolLabel(tierIncludes)
  if (powerMode === 'additive') {
    return `Additive (current): Power = Σ avg-norm across the current pool (${pool}). Every included player counts equally.`
  }
  return [
    `Depth-weighted (current): Power = Σ (weight × avg-norm) across ${pool}.`,
    `Weights: starter=${depthWeights.starter}, backup=${depthWeights.backup}, bench=${depthWeights.bench}.`,
    'A starter is worth more than a backup, which is worth more than a bench piece.',
  ].join(' ')
}

export function explainPortfolioShare(showPortfolioShare: boolean): string {
  return showPortfolioShare
    ? 'League total %: each team\'s raw Power ÷ Σ raw Power across the league. Sums to 100%.'
    : 'League total %: when on, each card shows the team\'s share of league-wide raw Power.'
}

export function explainHidePicks(hidePicks: boolean): string {
  return hidePicks
    ? 'Hide picks (on): rookie picks (e.g. 2026 1st round) are removed from the table.'
    : 'Hide picks (off): rookie picks are shown alongside players.'
}

export function explainHideUnhighlighted(hideUnhighlighted: boolean): string {
  return hideUnhighlighted
    ? 'Hide unhighlighted (on): only rows matching one of your active highlight toggles stay; picks are kept.'
    : 'Hide unhighlighted (off): unmatched rows are dimmed instead of removed.'
}

export function explainBadge(
  source: 'Power' | 'KTC' | 'FC' | 'DD',
  ctx: {
    lane: MetricLane
    normMode: NormMode
    scoreDisplay: ScoreDisplay
    tierIncludes: TierIncludes
    powerMode: PowerMode
    depthWeights: Record<DepthTier, number>
  },
): string {
  const pool = poolLabel(ctx.tierIncludes)
  const lane = laneLabel(ctx.lane)
  const scale = ctx.normMode === 'quantile' ? 'Quantile' : 'Max'
  const display =
    ctx.scoreDisplay === 'max9999'
      ? 'shown as max-scaled to 0–9999 (best team = 9999)'
      : ctx.scoreDisplay === 'ordinal'
        ? 'shown as ordinal rank (#1 = best)'
        : 'shown as 1–99 percentile'
  if (source === 'Power') {
    if (ctx.powerMode === 'depthWeighted') {
      return `Power = Σ (weight × avg-norm) over ${pool}. Lane = ${lane}, Scale = ${scale}, weights starter=${ctx.depthWeights.starter}/backup=${ctx.depthWeights.backup}/bench=${ctx.depthWeights.bench}; ${display}.`
    }
    return `Power = Σ avg-norm over ${pool}. Lane = ${lane}, Scale = ${scale}; ${display}.`
  }
  const sourceWord =
    source === 'KTC' ? 'KeepTradeCut' : source === 'FC' ? 'FantasyCalc' : 'Dynasty Daddy'
  return `${source} = Σ ${sourceWord} ${lane.toLowerCase()} norm over ${pool}. Scale = ${scale}; ${display}.`
}

export function explainPositionBadge(
  pos: 'QB' | 'RB' | 'WR' | 'TE',
  ctx: {
    lane: MetricLane
    normMode: NormMode
    scoreDisplay: ScoreDisplay
    tierIncludes: TierIncludes
  },
): string {
  const pool = poolLabel(ctx.tierIncludes)
  const lane = laneLabel(ctx.lane)
  const scale = ctx.normMode === 'quantile' ? 'Quantile' : 'Max'
  const display =
    ctx.scoreDisplay === 'max9999'
      ? 'shown as max-scaled to 0–9999 (best team at this position = 9999)'
      : ctx.scoreDisplay === 'ordinal'
        ? 'shown as ordinal rank (#1 = best at position)'
        : 'shown as 1–99 percentile'
  return `${pos} = Σ avg-norm of ${pos}s in ${pool}. avg-norm averages KTC + FC + DD per player. Lane = ${lane}, Scale = ${scale}; ${display}.`
}

export function explainDelta(kind: 'fc' | 'dd' | 'avg'): string {
  if (kind === 'fc') {
    return 'Δ FC = FC norm − KTC norm. Positive = FantasyCalc values this player higher than KTC; negative = lower.'
  }
  if (kind === 'dd') {
    return 'Δ DD = Dynasty Daddy norm − KTC norm. Positive = DD values this player higher than KTC; negative = lower.'
  }
  return 'Δ Avg = avg-norm − KTC norm, where avg-norm averages KTC + FC + DD. Picks up the consensus disagreement against KTC alone.'
}

export function explainDepthWeights(): string {
  return 'Multiplier applied to each player\'s avg-norm before summing into Power. Higher = that depth tier matters more.'
}

export function explainConsensusThresholdMode(mode: ConsensusThresholdMode): string {
  if (mode === 'rank') {
    return [
      'Rank gap (current): uses overall ranks (#1 = best). We require FantasyCalc and Dynasty Daddy to both rank the player at least N spots away from KTC on the same side, and that side must match the norm deltas (FC norm − KTC norm and DD norm − KTC norm both positive or both negative).',
      'Why: 0–9999 norm space is not linear in “true” value; rank spots behave more evenly from stars to depth.',
      'Applies everywhere the small trend icon appears (rankings, league rosters, delta tables, waiver).',
    ].join(' ')
  }
  return [
    'Adaptive percentile (current): over all non-pick players with both Δ FC and Δ DD, we take min(|Δ FC|, |Δ DD|) per player, sort them, and set the cutoff at your chosen percentile (default 90).',
    'The icon only shows when FC and DD agree on sign vs KTC and that joint disagreement is at least as large as the cutoff. Fewer false positives at the noisy low end; still sensitive at the top because the whole pool sets the scale.',
    'If there are too few players with data, we fall back to sign-only (no magnitude gate) until the sample is large enough.',
    'Applies everywhere the small trend icon appears.',
  ].join(' ')
}

export function explainConsensusRankMinGap(gap: number): string {
  return [
    `Minimum rank separation (current: ${gap}). We require min(|FC rank − KTC rank|, |DD rank − KTC rank|) ≥ ${gap}, with both gaps on the same side of zero and matching the norm-delta direction.`,
    'Example: gap 20 means the “weaker” of the two sources still disagrees with KTC by at least 20 overall-rank spots.',
    'Raise this to show fewer icons (stronger agreement only); lower for more hits.',
  ].join(' ')
}

export function explainConsensusPercentile(pct: number): string {
  return [
    `Percentile cutoff (current: ${pct}). We build the list of min(|Δ FC|, |Δ DD|) across all non-pick players with both deltas in the active lane, then the cutoff is the value at the ${pct}th percentile of that distribution.`,
    `Higher ${pct} → stricter (only the largest joint disagreements). Lower → more icons.`,
    'This adapts when your synced player pool or norms change, unlike a fixed raw number on 0–9999.',
  ].join(' ')
}

export function explainConsensusIconSummary(ctx: {
  mode: ConsensusThresholdMode
  rankMinGap: number
  percentile: number
  percentileCutoff: number | null
  laneLabel: string
}): string {
  const gate =
    ctx.mode === 'rank'
      ? `Rank mode: min rank gap ≥ ${ctx.rankMinGap} vs KTC, ranks aligned with norm deltas (${ctx.laneLabel}).`
      : ctx.percentileCutoff != null
        ? `Percentile mode: min(|Δ FC|,|Δ DD|) ≥ ${Math.round(ctx.percentileCutoff)} (${ctx.percentile}th percentile of the pool, ${ctx.laneLabel}).`
        : `Percentile mode: sample too small for a stable cutoff — showing same-sign FC+DD vs KTC only (${ctx.percentile}th target, ${ctx.laneLabel}).`
  return `${gate} Icon = both sources misprice vs KTC in the same direction.`
}
