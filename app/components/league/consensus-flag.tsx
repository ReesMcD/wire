import { TrendingUp, TrendingDown } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { MetricLane } from '@/lib/rankings/league-board-power-input'
import type { ConsensusThresholdMode } from '@/lib/rankings/consensus-threshold'
import { passesConsensusIndicator, consensusNormSign } from '@/lib/rankings/consensus-threshold'
import { explainConsensusIconSummary } from '@/lib/rankings/explain'
import { useUiSettings } from '@/lib/stores/ui-settings'

export interface ConsensusIndicatorLineProps {
  minAbsDeltaPercentileCutoff: number | null
  deltaFc: number | null | undefined
  deltaDd: number | null | undefined
  laneLabel: string
  mode: ConsensusThresholdMode
  percentile: number
  agreementMinEach: number
  /** Omit leading icon when the trigger already shows the same icon (e.g. ConsensusFlag popover). */
  leadIcon?: boolean
}

/** FC+DD vs KTC agreement line: optional icon + explanation, or muted “no signal”. For use inside larger tooltips. */
export function ConsensusIndicatorLine({
  minAbsDeltaPercentileCutoff,
  deltaFc,
  deltaDd,
  laneLabel,
  mode,
  percentile,
  agreementMinEach,
  leadIcon = true,
}: ConsensusIndicatorLineProps) {
  const dir = consensusNormSign(deltaFc, deltaDd)
  const passes = passesConsensusIndicator(deltaFc, deltaDd, mode, minAbsDeltaPercentileCutoff, agreementMinEach)
  if (!dir || !passes) {
    return (
      <p className="text-muted-foreground text-[11px] leading-snug">
        {laneLabel}: No FC+DD vs KTC signal at the current threshold.
      </p>
    )
  }

  const Icon = dir === 'higher' ? TrendingUp : TrendingDown
  const color =
    dir === 'higher'
      ? 'text-emerald-600 dark:text-emerald-500'
      : 'text-rose-600 dark:text-rose-400'
  const directionWord = dir === 'higher' ? 'higher' : 'lower'
  const subjectWord = dir === 'higher' ? 'undervaluing' : 'overvaluing'
  const mainLine = `${laneLabel}: FC and DD both value this player ${directionWord} than KTC (Δ FC ${formatDelta(deltaFc)}, Δ DD ${formatDelta(deltaDd)}). Two sources agree KTC may be ${subjectWord}.`
  const summary = explainConsensusIconSummary({
    mode,
    percentile,
    percentileCutoff: minAbsDeltaPercentileCutoff,
    laneLabel,
    agreementMinEach,
  })

  const body = <p className="text-[11px] leading-snug">{mainLine}</p>

  return (
    <div className="space-y-1.5">
      {leadIcon ? (
        <div className="flex items-start gap-2">
          <Icon className={cn('mt-0.5 shrink-0', color)} size={14} strokeWidth={2.25} />
          {body}
        </div>
      ) : (
        body
      )}
      <p className="text-muted-foreground border-t border-border pt-1.5 text-[10px] leading-snug">{summary}</p>
    </div>
  )
}

interface ConsensusFlagProps {
  lane: MetricLane
  /** Precomputed from the full synced player pool for this lane (see computeMinAbsDeltaPercentileCutoff). */
  minAbsDeltaPercentileCutoff: number | null
  deltaFc: number | null | undefined
  deltaDd: number | null | undefined
  /** Optional lane tag rendered next to the icon (e.g. "Dyn", "Rd"). */
  laneLabel?: string
  className?: string
}

function formatDelta(n: number | null | undefined): string {
  if (n == null) return '—'
  return n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString()
}

/** Icon when FC and DD agree vs KTC, gated by persisted percentile / agreement rules. */
export function ConsensusFlag({
  lane,
  minAbsDeltaPercentileCutoff,
  deltaFc,
  deltaDd,
  laneLabel,
  className,
}: ConsensusFlagProps) {
  const mode = useUiSettings((s) => s.consensusThresholdMode)
  const percentile = useUiSettings((s) => s.consensusPercentile)
  const agreementMinEach = useUiSettings((s) => s.consensusMinNormDiff)

  const dir = consensusNormSign(deltaFc, deltaDd)
  const passes = passesConsensusIndicator(deltaFc, deltaDd, mode, minAbsDeltaPercentileCutoff, agreementMinEach)
  if (!dir || !passes) return null

  const Icon = dir === 'higher' ? TrendingUp : TrendingDown
  const color =
    dir === 'higher'
      ? 'text-emerald-600 dark:text-emerald-500'
      : 'text-rose-600 dark:text-rose-400'
  const directionWord = dir === 'higher' ? 'higher' : 'lower'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={`${laneLabel ? `${laneLabel} ` : ''}FC and DD ${directionWord} than KTC`}
          className={cn(
            'inline-flex shrink-0 cursor-help items-center gap-0.5 align-middle leading-none',
            color,
            className,
          )}
        >
          <Icon size={14} strokeWidth={2.25} />
          {laneLabel ? <span className="text-[10px] font-semibold uppercase tracking-wide">{laneLabel}</span> : null}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ConsensusIndicatorLine
          minAbsDeltaPercentileCutoff={minAbsDeltaPercentileCutoff}
          deltaFc={deltaFc}
          deltaDd={deltaDd}
          laneLabel={laneLabel ?? (lane === 'dynasty' ? 'Dynasty' : 'Redraft')}
          mode={mode}
          percentile={percentile}
          agreementMinEach={agreementMinEach}
          leadIcon={false}
        />
      </TooltipContent>
    </Tooltip>
  )
}
