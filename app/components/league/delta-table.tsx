import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AggregatedPlayer } from '@/lib/rankings/player-metrics'
import type { MetricLane } from '@/lib/rankings/league-board-power-input'
import { explainDelta } from '@/lib/rankings/explain'
import { computeMinAbsDeltaPercentileCutoff } from '@/lib/rankings/consensus-threshold'
import { ConsensusFlag } from '@/components/league/consensus-flag'
import { useUiSettings } from '@/lib/stores/ui-settings'
import { sortNullsLast } from '@/lib/rankings/sort'

export interface DeltaRow {
  sleeperId: string
  name: string
  position: string | null
  ktcNorm: number | null
  fcNorm: number | null
  ddNorm: number | null
  avgNorm: number | null
  deltaFc: number | null
  deltaDd: number | null
  deltaAvg: number | null
}

/** Build delta rows for a given lane; Δ Avg is computed inline (no AggregatedPlayer expansion needed). */
export function buildDeltaRows(players: AggregatedPlayer[], lane: MetricLane): DeltaRow[] {
  const rows: DeltaRow[] = []
  for (const p of players) {
    if (p.position === 'PICK' || p.sleeperId.startsWith('pick:')) continue
    const ktc = lane === 'dynasty' ? p.dynKtcNorm : p.rdKtcNorm
    const fc = lane === 'dynasty' ? p.dynFcNorm : p.rdFcNorm
    const dd = lane === 'dynasty' ? p.dynDdNorm : p.rdDdNorm
    const avg = lane === 'dynasty' ? p.dynAvgNorm : p.rdAvgNorm
    const dFc = lane === 'dynasty' ? p.dynDeltaNormFcVsKtc : p.rdDeltaNormFcVsKtc
    const dDd = lane === 'dynasty' ? p.dynDeltaNormDdVsKtc : p.rdDeltaNormDdVsKtc
    const dAvg = avg != null && ktc != null ? avg - ktc : null
    rows.push({
      sleeperId: p.sleeperId,
      name: p.name,
      position: p.position,
      ktcNorm: ktc,
      fcNorm: fc,
      ddNorm: dd,
      avgNorm: avg,
      deltaFc: dFc,
      deltaDd: dDd,
      deltaAvg: dAvg,
    })
  }
  return rows
}

interface DeltaTableProps {
  players: AggregatedPlayer[]
  lane: MetricLane
  /**
   * Pool used to compute the percentile cutoff for the FC+DD icon (defaults to `players`).
   * Pass the full synced player list when `players` is a subset (e.g. one roster or FAs only).
   */
  percentileReferencePlayers?: AggregatedPlayer[]
  /** Cap rows after sorting; default 25. Set to `null` for no cap. */
  topN?: number | null
  /** Default sort column id; default 'deltaAvg'. */
  defaultSortId?: keyof DeltaRow
  /** Default sort direction; default 'desc'. */
  defaultSortDesc?: boolean
  /** Optional leagueId to forward when player name links to /player/$sleeperId. */
  leagueId?: string
}

const numCell = (val: number | null) =>
  val != null ? <span className="tabular-nums">{val.toLocaleString()}</span> : <span className="text-muted-foreground">—</span>

const deltaCell = (val: number | null) => {
  if (val == null) return <span className="text-muted-foreground">—</span>
  const text = val > 0 ? `+${val.toLocaleString()}` : val.toLocaleString()
  return (
    <span
      className={cn(
        'tabular-nums',
        val > 0 && 'text-emerald-600 dark:text-emerald-500',
        val < 0 && 'text-rose-600 dark:text-rose-400',
      )}
    >
      {text}
    </span>
  )
}

export function DeltaTable({
  players,
  lane,
  percentileReferencePlayers,
  topN = 25,
  defaultSortId = 'deltaAvg',
  defaultSortDesc = true,
  leagueId,
}: DeltaTableProps) {
  const data = useMemo(() => buildDeltaRows(players, lane), [players, lane])
  const consensusPct = useUiSettings((s) => s.consensusPercentile)
  const refPool = percentileReferencePlayers ?? players
  const consensusCutoff = useMemo(
    () => computeMinAbsDeltaPercentileCutoff(refPool, lane, consensusPct),
    [refPool, lane, consensusPct],
  )
  const bySleeperId = useMemo(() => new Map(players.map((p) => [p.sleeperId, p])), [players])

  const [sorting, setSorting] = useState<SortingState>([
    { id: String(defaultSortId), desc: defaultSortDesc },
  ])

  const deltaHeader = (label: string, kind: 'fc' | 'dd' | 'avg') => () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{explainDelta(kind)}</TooltipContent>
    </Tooltip>
  )

  const columns = useMemo<ColumnDef<DeltaRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Player',
        cell: ({ row }) => (
          <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
            <Link
              to="/player/$sleeperId"
              params={{ sleeperId: row.original.sleeperId }}
              search={{ leagueId }}
              className="font-medium hover:underline"
            >
              {row.original.name}
            </Link>
            {row.original.position && (
              <Badge variant="outline" className="text-xs">
                {row.original.position}
              </Badge>
            )}
            <ConsensusFlag
              lane={lane}
              player={bySleeperId.get(row.original.sleeperId)}
              minAbsDeltaPercentileCutoff={consensusCutoff}
              deltaFc={row.original.deltaFc}
              deltaDd={row.original.deltaDd}
            />
          </div>
        ),
      },
      {
        accessorKey: 'ktcNorm',
        header: 'KTC',
        cell: ({ getValue }) => numCell(getValue() as number | null),
      },
      {
        accessorKey: 'fcNorm',
        header: 'FC',
        cell: ({ getValue }) => numCell(getValue() as number | null),
      },
      {
        accessorKey: 'deltaFc',
        header: deltaHeader('Δ FC', 'fc'),
        cell: ({ getValue }) => deltaCell(getValue() as number | null),
        sortUndefined: 'last',
      },
      {
        accessorKey: 'ddNorm',
        header: 'DD',
        cell: ({ getValue }) => numCell(getValue() as number | null),
      },
      {
        accessorKey: 'deltaDd',
        header: deltaHeader('Δ DD', 'dd'),
        cell: ({ getValue }) => deltaCell(getValue() as number | null),
        sortUndefined: 'last',
      },
      {
        accessorKey: 'avgNorm',
        header: 'Avg',
        cell: ({ getValue }) => numCell(getValue() as number | null),
      },
      {
        accessorKey: 'deltaAvg',
        header: deltaHeader('Δ Avg', 'avg'),
        cell: ({ getValue }) => deltaCell(getValue() as number | null),
        sortUndefined: 'last',
      },
    ],
    [lane, consensusCutoff, bySleeperId, leagueId],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst: true,
    defaultColumn: { sortingFn: sortNullsLast },
  })

  const allRows = table.getRowModel().rows
  const rows = topN == null ? allRows : allRows.slice(0, topN)

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        No players with synced values to compare.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full caption-bottom text-sm">
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="cursor-pointer select-none whitespace-nowrap text-muted-foreground"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === 'asc' ? ' ↑' : ''}
                  {header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  )
}
