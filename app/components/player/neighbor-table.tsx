import { Link } from '@tanstack/react-router'
import type { AggregatedPlayer } from '@/lib/rankings/player-metrics'
import type { MetricLane } from '@/lib/rankings/league-board-power-input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

function laneAvg(p: AggregatedPlayer, lane: MetricLane): number | null {
  return lane === 'dynasty' ? p.dynAvgNorm : p.rdAvgNorm
}

export function NeighborTable({
  title,
  above,
  below,
  lane,
  leagueId,
}: {
  title: string
  above: AggregatedPlayer[]
  below: AggregatedPlayer[]
  lane: MetricLane
  leagueId?: string
}) {
  const rows = [...above, ...below]
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground py-2 text-xs">
        <span className="font-medium text-foreground">{title}</span> — no neighbors in range.
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{title}</p>
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8">Player</TableHead>
              <TableHead className="h-8">Pos</TableHead>
              <TableHead className="h-8 text-right">Avg norm</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {above.map((r) => (
              <NeighborRow key={`a-${r.sleeperId}`} p={r} lane={lane} leagueId={leagueId} />
            ))}
            {below.map((r) => (
              <NeighborRow key={`b-${r.sleeperId}`} p={r} lane={lane} leagueId={leagueId} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function NeighborRow({
  p,
  lane,
  leagueId,
}: {
  p: AggregatedPlayer
  lane: MetricLane
  leagueId?: string
}) {
  const avg = laneAvg(p, lane)
  return (
    <TableRow className="hover:bg-muted/40">
      <TableCell className="py-1.5">
        <Link
          to="/player/$sleeperId"
          params={{ sleeperId: p.sleeperId }}
          search={{ leagueId: leagueId as string | undefined }}
          className="font-medium hover:underline"
        >
          {p.name}
        </Link>
      </TableCell>
      <TableCell className="py-1.5">
        {p.position ? (
          <Badge variant="outline" className="text-xs">
            {p.position}
          </Badge>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className="py-1.5 text-right tabular-nums">
        {avg != null ? avg.toLocaleString() : '—'}
      </TableCell>
    </TableRow>
  )
}
