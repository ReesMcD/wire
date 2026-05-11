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

/** One-line hint for tooltips on mode buttons (Popover / modal friendly). */
export function explainConsensusModeTooltip(mode: ConsensusThresholdMode): string {
  if (mode === 'rank') {
    return 'Rank gap: FC+DD same direction vs KTC on norms, and both rank vs KTC by at least your min gap.'
  }
  if (mode === 'percentile') {
    return 'Percentile: FC+DD same direction vs KTC, and min(|Δ FC|,|Δ DD|) above a pool-derived cutoff.'
  }
  return 'Sign: FC+DD both above or both below KTC on normalized deltas; optional min size on min(|Δ|).'
}

export function explainConsensusThresholdMode(mode: ConsensusThresholdMode): string {
  if (mode === 'rank') {
    return [
      'Rank gap: uses overall ranks (#1 = best). FantasyCalc and Dynasty Daddy must both rank the player at least N spots away from KTC on the same side, matching norm deltas (FC−KTC and DD−KTC both positive or both negative).',
      'Useful when you care about overall list position, not only raw norm distance.',
    ].join(' ')
  }
  if (mode === 'percentile') {
    return [
      'Percentile: over non-pick players with both deltas, take min(|Δ FC|,|Δ DD|) per player and set a cutoff at your chosen percentile of that distribution.',
      'The icon needs same sign vs KTC and joint magnitude at least that cutoff (or sign-only if the sample is too small).',
    ].join(' ')
  }
  return [
    'Sign: FC and DD normalized deltas vs KTC are both positive (both sources higher than KTC) or both negative (both lower).',
    'Optional minimum on min(|Δ FC|,|Δ DD|) filters out tiny disagreements; set to 0 to allow any same-sign non-zero pair.',
  ].join(' ')
}

export function explainConsensusMinNormDiff(n: number): string {
  return [
    `Minimum joint norm distance (current: ${n}). We require min(|Δ FC|,|Δ DD|) ≥ ${n} after FC and DD agree in sign vs KTC.`,
    '0 = show the icon whenever both deltas are non-zero and on the same side. Raise to require a stronger shared move vs KTC.',
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
  signMinNormDiff: number
}): string {
  const rankGate = `Rank: min gap ≥ ${ctx.rankMinGap}, ranks aligned with norm deltas (${ctx.laneLabel}).`
  const pctGate =
    ctx.percentileCutoff != null
      ? `Percentile: min(|Δ FC|,|Δ DD|) ≥ ${Math.round(ctx.percentileCutoff)} (${ctx.percentile}th pctl, ${ctx.laneLabel}).`
      : `Percentile: small sample — sign-only gate (${ctx.percentile}th target, ${ctx.laneLabel}).`
  const signGate =
    ctx.signMinNormDiff > 0
      ? `Sign: same direction vs KTC, min(|Δ FC|,|Δ DD|) ≥ ${ctx.signMinNormDiff} (${ctx.laneLabel}).`
      : `Sign: same direction vs KTC on norms, any non-zero pair (${ctx.laneLabel}).`

  if (ctx.mode === 'rank') {
    return rankGate
  }
  if (ctx.mode === 'percentile') {
    return pctGate
  }
  return signGate
}

/** Help text for the FC+DD vs KTC control cluster (Settings + inline). */
export function explainConsensusModesOverview(): string {
  return [
    'Rank gap: same-direction norm deltas vs KTC plus rank-distance rules (min gap between FC/DD ranks and KTC).',
    'Percentile: same-direction deltas plus a pool-based cutoff on min(|Δ FC|,|Δ DD|) from your percentile setting.',
    'Sign: same-direction only (both positive or both negative vs KTC on normalized deltas), with an optional floor on min(|Δ FC|,|Δ DD|).',
    'Persisted values also appear on Settings.',
  ].join(' ')
}
