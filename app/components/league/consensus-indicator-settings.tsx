import { Link } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { useEffect, useState } from 'react'
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
} from '@/lib/rankings/explain'

function useDraftIntField(storeValue: number, onCommit: (n: number) => void) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(() => String(storeValue))

  useEffect(() => {
    if (!focused) setDraft(String(storeValue))
  }, [storeValue, focused])

  return {
    inputProps: {
      value: draft,
      onFocus: () => {
        setFocused(true)
        setDraft(String(storeValue))
      },
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
      onBlur: () => {
        setFocused(false)
        const n = Number.parseInt(draft.trim(), 10)
        if (!Number.isNaN(n)) onCommit(n)
        else setDraft(String(storeValue))
      },
    },
  }
}

/** Global controls for the FC+DD vs KTC agreement icon (persisted). */
export function ConsensusIndicatorSettings({ className }: { className?: string }) {
  const mode = useUiSettings((s) => s.consensusThresholdMode)
  const setMode = useUiSettings((s) => s.setConsensusThresholdMode)
  const percentile = useUiSettings((s) => s.consensusPercentile)
  const setPercentile = useUiSettings((s) => s.setConsensusPercentile)
  const agreementMinEach = useUiSettings((s) => s.consensusMinNormDiff)
  const setAgreementMinEach = useUiSettings((s) => s.setConsensusMinNormDiff)
  const [helpOpen, setHelpOpen] = useState(false)

  const pctlDraft = useDraftIntField(percentile, setPercentile)
  const agreeDraft = useDraftIntField(agreementMinEach, setAgreementMinEach)

  return (
    <div className={className}>
      <p className="text-muted-foreground mb-2 max-w-2xl text-xs leading-relaxed">
        The arrow icon means FantasyCalc and Daddy Data both disagree with KTC the same way (both higher or both
        lower on normalized values). Choose how strong that disagreement must be before we show the icon.
      </p>
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
              <ul className="text-muted-foreground list-inside list-disc space-y-2 text-xs leading-relaxed">
                <li>
                  <span className="font-medium text-foreground">Percentile</span> —{' '}
                  {explainConsensusModeTooltip('percentile')}
                </li>
                <li>
                  <span className="font-medium text-foreground">Agreement</span> —{' '}
                  {explainConsensusModeTooltip('agreement')}
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
              variant={mode === 'agreement' ? 'default' : 'outline'}
              className="min-h-9"
              onClick={() => setMode('agreement')}
            >
              Agreement
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
            {explainConsensusModeTooltip('agreement')}
          </TooltipContent>
        </Tooltip>
        {mode === 'percentile' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground whitespace-nowrap">Pctl</span>
                <Input
                  className="h-8 w-14 px-1 text-center font-mono text-xs"
                  inputMode="numeric"
                  {...pctlDraft.inputProps}
                />
              </label>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
              {explainConsensusPercentile(percentile)}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {mode === 'agreement' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground whitespace-nowrap">Min each</span>
                <Input
                  className="h-8 w-16 px-1 text-center font-mono text-xs"
                  inputMode="numeric"
                  {...agreeDraft.inputProps}
                />
              </label>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
              {explainConsensusMinNormDiff(agreementMinEach)}
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
