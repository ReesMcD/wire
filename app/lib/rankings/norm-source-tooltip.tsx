import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AggregatedPlayer } from '@/lib/rankings/player-metrics'

export type TableMetricLane = 'dynasty' | 'redraft'

export function normsForLane(p: AggregatedPlayer, lane: TableMetricLane) {
  if (lane === 'dynasty') {
    return {
      ktc: p.dynKtcNorm,
      fc: p.dynFcNorm,
      dd: p.dynDdNorm,
      avg: p.dynAvgNorm,
    }
  }
  return {
    ktc: p.rdKtcNorm,
    fc: p.rdFcNorm,
    dd: p.rdDdNorm,
    avg: p.rdAvgNorm,
  }
}

function formatNorm(n: number | null) {
  return n != null ? n.toLocaleString() : '—'
}

export function ActiveLaneNormTooltip({ player, lane }: { player: AggregatedPlayer; lane: TableMetricLane }) {
  const n = normsForLane(player, lane)
  return (
    <div className="space-y-1.5 text-xs">
      <p className="font-medium text-foreground">{lane === 'dynasty' ? 'Dynasty' : 'Redraft'} norms</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">KTC</dt>
        <dd className="text-right tabular-nums">{formatNorm(n.ktc)}</dd>
        <dt className="text-muted-foreground">FantasyCalc</dt>
        <dd className="text-right tabular-nums">{formatNorm(n.fc)}</dd>
        <dt className="text-muted-foreground">{lane === 'dynasty' ? 'Dynasty Daddy' : 'ADP Daddy'}</dt>
        <dd className="text-right tabular-nums">{formatNorm(n.dd)}</dd>
        <dt className="text-muted-foreground">Avg</dt>
        <dd className="text-right tabular-nums">{formatNorm(n.avg)}</dd>
      </dl>
    </div>
  )
}

/** When `columnLane` matches `activeLane`, wrap `inner` with a tooltip listing all four normalized sources for that lane. */
export function wrapNormWithLaneTooltip(
  activeLane: TableMetricLane,
  columnLane: TableMetricLane,
  player: AggregatedPlayer,
  inner: ReactNode,
) {
  if (columnLane !== activeLane) return inner
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center underline decoration-dotted decoration-muted-foreground/60 underline-offset-2">
          {inner}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs">
        <ActiveLaneNormTooltip player={player} lane={columnLane} />
      </TooltipContent>
    </Tooltip>
  )
}
