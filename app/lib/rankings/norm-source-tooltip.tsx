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

function formatDiff(d: number | null, r: number | null) {
  if (d == null || r == null) return '—'
  const v = d - r
  const t = v > 0 ? `+${v.toLocaleString()}` : v.toLocaleString()
  return t
}

export function ActiveLaneNormTooltip({ player, lane }: { player: AggregatedPlayer; lane: TableMetricLane }) {
  const n = normsForLane(player, lane)
  const dk = player.dynKtcNorm
  const rk = player.rdKtcNorm
  const df = player.dynFcNorm
  const rf = player.rdFcNorm
  const dd = player.dynDdNorm
  const rd = player.rdDdNorm
  const da = player.dynAvgNorm
  const ra = player.rdAvgNorm
  return (
    <div className="space-y-2 text-xs">
      <div className="space-y-1.5">
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
      <div className="space-y-1 border-t border-border pt-2">
        <p className="font-medium text-foreground">Dyn − Rd (normalized)</p>
        <dl className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 gap-y-1 text-[11px]">
          <dt />
          <dd className="text-center text-muted-foreground">Dyn</dd>
          <dd className="text-center text-muted-foreground">Rd</dd>
          <dd className="text-center text-muted-foreground">Δ</dd>
          <dt className="text-muted-foreground">KTC</dt>
          <dd className="text-right tabular-nums">{formatNorm(dk)}</dd>
          <dd className="text-right tabular-nums">{formatNorm(rk)}</dd>
          <dd className="text-right tabular-nums">{formatDiff(dk, rk)}</dd>
          <dt className="text-muted-foreground">FC</dt>
          <dd className="text-right tabular-nums">{formatNorm(df)}</dd>
          <dd className="text-right tabular-nums">{formatNorm(rf)}</dd>
          <dd className="text-right tabular-nums">{formatDiff(df, rf)}</dd>
          <dt className="text-muted-foreground">DD</dt>
          <dd className="text-right tabular-nums">{formatNorm(dd)}</dd>
          <dd className="text-right tabular-nums">{formatNorm(rd)}</dd>
          <dd className="text-right tabular-nums">{formatDiff(dd, rd)}</dd>
          <dt className="text-muted-foreground">Avg</dt>
          <dd className="text-right tabular-nums">{formatNorm(da)}</dd>
          <dd className="text-right tabular-nums">{formatNorm(ra)}</dd>
          <dd className="text-right tabular-nums">{formatDiff(da, ra)}</dd>
        </dl>
      </div>
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
