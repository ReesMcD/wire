import { Link } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiSettings } from '@/lib/stores/ui-settings'
import {
  explainConsensusMinNormDiff,
  explainConsensusModeTooltip,
  explainConsensusModesOverview,
  explainConsensusPercentile,
  explainConsensusRankMinGap,
} from '@/lib/rankings/explain'

/** Global controls for the FC+DD vs KTC agreement icon (persisted). */
export function ConsensusIndicatorSettings({ className }: { className?: string }) {
  const mode = useUiSettings((s) => s.consensusThresholdMode)
  const setMode = useUiSettings((s) => s.setConsensusThresholdMode)
  const rankMinGap = useUiSettings((s) => s.consensusRankMinGap)
  const setRankMinGap = useUiSettings((s) => s.setConsensusRankMinGap)
  const percentile = useUiSettings((s) => s.consensusPercentile)
  const setPercentile = useUiSettings((s) => s.setConsensusPercentile)
  const signMinNormDiff = useUiSettings((s) => s.consensusMinNormDiff)
  const setSignMinNormDiff = useUiSettings((s) => s.setConsensusMinNormDiff)
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-sm">FC+DD vs KTC icon:</span>
          <Popover open={helpOpen} onOpenChange={setHelpOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-8 shrink-0"
                aria-label="How consensus modes work"
              >
                <Info className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(calc(100vw-2rem),22rem)] space-y-3 p-3" align="start">
              <p className="text-sm leading-snug">{explainConsensusModesOverview()}</p>
              <ul className="text-muted-foreground list-inside list-disc space-y-1.5 text-xs leading-snug">
                <li>
                  <span className="font-medium text-foreground">Rank gap</span> — {explainConsensusModeTooltip('rank')}
                </li>
                <li>
                  <span className="font-medium text-foreground">Percentile</span> —{' '}
                  {explainConsensusModeTooltip('percentile')} Pctl field sets the pool percentile (also in Settings).
                </li>
                <li>
                  <span className="font-medium text-foreground">Sign</span> — {explainConsensusModeTooltip('sign')} Min
                  Δ field sets the floor on min(|Δ FC|,|Δ DD|).
                </li>
              </ul>
              <p className="text-muted-foreground border-t border-border pt-2 text-xs">
                <Link
                  to="/settings"
                  className="text-foreground font-medium underline underline-offset-2"
                  onClick={() => setHelpOpen(false)}
                >
                  Settings
                </Link>{' '}
                stores the same defaults.
              </p>
            </PopoverContent>
          </Popover>
        </div>
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
          <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
            {explainConsensusModeTooltip('rank')}
          </TooltipContent>
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
          <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
            {explainConsensusModeTooltip('percentile')}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={mode === 'sign' ? 'default' : 'outline'}
              className="min-h-9"
              onClick={() => setMode('sign')}
            >
              Sign
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
            {explainConsensusModeTooltip('sign')}
          </TooltipContent>
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
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
              {explainConsensusRankMinGap(rankMinGap)}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {mode === 'percentile' ? (
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
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
              {explainConsensusPercentile(percentile)}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {mode === 'sign' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground whitespace-nowrap">Min Δ</span>
                <Input
                  className="h-8 w-16 px-1 text-center font-mono text-xs"
                  inputMode="numeric"
                  value={String(signMinNormDiff)}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10)
                    if (!Number.isNaN(n)) setSignMinNormDiff(n)
                  }}
                />
              </label>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
              {explainConsensusMinNormDiff(signMinNormDiff)}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-1 max-w-2xl text-xs">
        Same setting everywhere the icon appears (rankings, league cards, team roster, waiver, delta tables).
      </p>
    </div>
  )
}
