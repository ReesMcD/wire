import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiSettings } from '@/lib/stores/ui-settings'
import {
  explainConsensusPercentile,
  explainConsensusRankMinGap,
  explainConsensusThresholdMode,
} from '@/lib/rankings/explain'

/** Global controls for the FC+DD vs KTC agreement icon (persisted). */
export function ConsensusIndicatorSettings({ className }: { className?: string }) {
  const mode = useUiSettings((s) => s.consensusThresholdMode)
  const setMode = useUiSettings((s) => s.setConsensusThresholdMode)
  const rankMinGap = useUiSettings((s) => s.consensusRankMinGap)
  const setRankMinGap = useUiSettings((s) => s.setConsensusRankMinGap)
  const percentile = useUiSettings((s) => s.consensusPercentile)
  const setPercentile = useUiSettings((s) => s.setConsensusPercentile)

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">FC+DD vs KTC icon:</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={mode === 'rank' ? 'default' : 'outline'}
              className="min-h-9"
              onClick={() => setMode('rank')}
            >
              Rank gap
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{explainConsensusThresholdMode('rank')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={mode === 'percentile' ? 'default' : 'outline'}
              className="min-h-9"
              onClick={() => setMode('percentile')}
            >
              Percentile
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{explainConsensusThresholdMode('percentile')}</TooltipContent>
        </Tooltip>
        {mode === 'rank' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground whitespace-nowrap">Min gap</span>
                <Input
                  className="h-8 w-14 px-1 text-center font-mono text-xs"
                  inputMode="numeric"
                  value={String(rankMinGap)}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10)
                    if (!Number.isNaN(n)) setRankMinGap(n)
                  }}
                />
              </label>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{explainConsensusRankMinGap(rankMinGap)}</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground whitespace-nowrap">Pctl</span>
                <Input
                  className="h-8 w-14 px-1 text-center font-mono text-xs"
                  inputMode="numeric"
                  value={String(percentile)}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10)
                    if (!Number.isNaN(n)) setPercentile(n)
                  }}
                />
              </label>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{explainConsensusPercentile(percentile)}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className="text-muted-foreground mt-1 max-w-2xl text-xs">
        Same setting everywhere the icon appears (rankings, league cards, team roster, waiver, delta tables).
      </p>
    </div>
  )
}
