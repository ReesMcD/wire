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
  if (mode === 'percentile') {
    return 'Percentile: FC and DD agree with each other vs KTC (same direction), and the smaller of the two disagreements clears a cutoff learned from your whole player pool.'
  }
  if (mode === 'agreement') {
    return 'Agreement: FC and DD agree with each other vs KTC (same direction), and each disagreement must be at least your minimum size (on the 0–9999 norm scale).'
  }
  return mode satisfies never ? '' : ''
}

export function explainConsensusThresholdMode(mode: ConsensusThresholdMode): string {
  if (mode === 'percentile') {
    return [
      'Looks at every non-pick player who has both a FantasyCalc and a Daddy Data delta vs KTC.',
      'We take the smaller of the two deltas for each player, line those values up from smallest to largest, and draw a line at the percentile you pick. The icon only lights up when FC and DD are on the same side of KTC and that “smaller disagreement” is above the line (unless the pool is too small—then we only require same direction).',
    ].join(' ')
  }
  if (mode === 'agreement') {
    return [
      'FC and DD must point the same way vs KTC (both think he is higher than KTC, or both lower).',
      'Then each source’s gap vs KTC must be at least your minimum number. Example: 100 means both FantasyCalc and Daddy Data disagree with KTC by at least 100 norm points, not just one of them.',
      'Set the minimum to 0 to allow any non-zero same-direction pair.',
    ].join(' ')
  }
  return mode satisfies never ? '' : ''
}

export function explainConsensusMinNormDiff(n: number): string {
  return [
    `Minimum size on each source (current: ${n}). After FC and DD agree in direction vs KTC, we require BOTH |FantasyCalc − KTC| and |Daddy Data − KTC| to be at least ${n} on the normalized scale.`,
    '0 = only the direction has to match; raise the number to ignore tiny disagreements and show the icon only when both sources disagree with KTC by a meaningful amount.',
  ].join(' ')
}

/** @deprecated Rank mode removed; kept for type compatibility only. */
export function explainConsensusRankMinGap(gap: number): string {
  return `Legacy setting (unused). Previous “rank gap” value was ${gap}. Use Agreement or Percentile modes instead.`
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
  percentile: number
  percentileCutoff: number | null
  laneLabel: string
  agreementMinEach: number
}): string {
  const pctGate =
    ctx.percentileCutoff != null
      ? `Percentile: smaller of the two deltas vs KTC ≥ ${Math.round(ctx.percentileCutoff)} (${ctx.percentile}th percentile of the pool, ${ctx.laneLabel}).`
      : `Percentile: small sample — same-direction only (${ctx.percentile}th target, ${ctx.laneLabel}).`
  const agrGate =
    ctx.agreementMinEach > 0
      ? `Agreement: same direction vs KTC, and BOTH |FC−KTC| and |DD−KTC| ≥ ${ctx.agreementMinEach} (${ctx.laneLabel}).`
      : `Agreement: same direction vs KTC on norms, any non-zero pair (${ctx.laneLabel}).`

  if (ctx.mode === 'percentile') {
    return pctGate
  }
  return agrGate
}

/** Help text for the FC+DD vs KTC control cluster (Settings + inline). */
export function explainConsensusModesOverview(): string {
  return [
    'Percentile: FC and Daddy Data agree with each other vs KTC in direction, and how far they disagree is compared to the rest of your synced players (adaptive cutoff).',
    'Agreement: same direction rule, plus a fixed minimum size that each source’s disagreement with KTC must meet.',
    'These settings are saved and apply anywhere the green/red arrow icon appears (rankings, league cards, roster tooltips, waivers).',
  ].join(' ')
}

export function explainSettingsRankingsLeagueIntro(): string {
  return 'Your Sleeper league ID ties the app to one league’s rosters. We use it to highlight who is on which roster in Rankings, to refresh roster data, and as the default when you open Rankings from Settings.'
}

export function explainSettingsNormalizationIntro(): string {
  return 'Before comparing FantasyCalc, KTC, and Daddy Data, every raw value is stretched onto a common 0–9999 scale. “Max” pins the top player at 9999; “Quantile” lines sources up so typical stars land in a similar band. Change this when you want rankings to feel more “spread out” or more compressed.'
}

export function explainSettingsConsensusIntro(): string {
  return 'The small arrow next to a player means FantasyCalc and Daddy Data both disagree with KTC in the same direction (both think he is more expensive than KTC, or both cheaper). The mode decides how strong that disagreement must be before we show the icon.'
}

export function explainSettingsLeaguePowerIntro(): string {
  return 'These options change how team strength badges are computed and labeled on the league overview. They do not change player-level ranks inside the big spreadsheet unless you also change tiers on the league page.'
}

export function explainSettingsRankingsColumnsIntro(): string {
  return 'Controls the wide Rankings table only: which source columns are visible per lane, whether draft picks appear as rows, and whether player similarity lists on the player page can suggest picks.'
}

export function explainSettingsLaneSourceToggles(): string {
  return 'Each KTC / FC / DD / Avg button shows or hides that whole column block for the dynasty or redraft half of the Rankings spreadsheet. Hiding a source does not remove it from power math elsewhere—only from this table.'
}

export function explainSettingsHidePickRows(): string {
  return 'When on, draft picks disappear from Rankings rows and from team roster tables that respect this flag. Player values and pick values still sync; they are just hidden in those lists.'
}

export function explainSettingsSimilarityIncludePicks(): string {
  return 'When on, the “similar players” style lists on a player’s page can include draft picks as neighbors. Turn off if you only want real players in those suggestions.'
}

export function explainSettingsSaveOpenRankings(): string {
  return 'Writes this league ID to saved settings and jumps to Rankings with it in the URL so highlights match that league.'
}

export function explainSettingsClearLeague(): string {
  return 'Clears the saved league ID and opens Rankings without a league filter.'
}

export function explainSettingsRefreshRosters(): string {
  return 'Fetches the latest Sleeper rosters for the saved league ID and refreshes cached data used across the app.'
}

export function explainSettingsDepthWeightsRow(): string {
  return 'Only used in “Depth-weighted” power mode. Each number is a multiplier for starters, backups, and bench before their avg-norms are summed. Starters default to 1; lowering backups/bench makes depth matter less in the headline power number.'
}
