import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageSubheader } from '@/components/ui/page-subheader'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useLeagueRoute } from '@/lib/league-route-context'
import type { LeagueUser, Roster } from '@/lib/db/schema'
import { aggregatePlayerValues, type AggregatedPlayer } from '@/lib/rankings/player-metrics'
import { buildLeagueRosterIndex, classifyLeagueRow } from '@/lib/league/roster-index'
import { DeltaTable } from '@/components/league/delta-table'
import { ConsensusFlag } from '@/components/league/consensus-flag'
import { ConsensusIndicatorSettings } from '@/components/league/consensus-indicator-settings'
import { computeMinAbsDeltaPercentileCutoff } from '@/lib/rankings/consensus-threshold'
import { useUiSettings } from '@/lib/stores/ui-settings'
import {
  explainDelta,
  explainLane,
  explainNormMode,
  laneLabel,
} from '@/lib/rankings/explain'

function rosterDisplayName(roster: Roster, users: LeagueUser[]) {
  const u = users.find((x) => x.userId === roster.ownerId)
  return u?.teamName ?? u?.displayName ?? `Roster ${roster.rosterId}`
}

export const Route = createFileRoute('/league/$leagueId/waiver')({
  component: WaiverPage,
})

function WaiverPage() {
  const { leagueId, players, values, leagueSnapshot } = useLeagueRoute()

  const metricLane = useUiSettings((s) => s.metricLane)
  const setMetricLane = useUiSettings((s) => s.setMetricLane)
  const normMode = useUiSettings((s) => s.normMode)
  const setNormMode = useUiSettings((s) => s.setNormMode)

  const [globalFilter, setGlobalFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState<string | null>(null)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'avgNorm', desc: true }])
  /** When set, that roster’s players are listed with FAs for side‑by‑side comparison. */
  const [compareRosterId, setCompareRosterId] = useState<number | null>(null)

  const aggregated = useMemo(
    () => aggregatePlayerValues(players, values, normMode),
    [players, values, normMode],
  )

  const consensusPercentileSetting = useUiSettings((s) => s.consensusPercentile)
  const dynConsensusCutoff = useMemo(
    () => computeMinAbsDeltaPercentileCutoff(aggregated, 'dynasty', consensusPercentileSetting),
    [aggregated, consensusPercentileSetting],
  )
  const rdConsensusCutoff = useMemo(
    () => computeMinAbsDeltaPercentileCutoff(aggregated, 'redraft', consensusPercentileSetting),
    [aggregated, consensusPercentileSetting],
  )

  const bySleeperId = useMemo(() => new Map(aggregated.map((p) => [p.sleeperId, p])), [aggregated])

  const faPlayers = useMemo(() => {
    const index = buildLeagueRosterIndex(leagueSnapshot.rosters)
    return aggregated.filter((p) => {
      if (p.position === 'PICK' || p.sleeperId.startsWith('pick:')) return false
      return classifyLeagueRow(p.sleeperId, index).kind === 'fa'
    })
  }, [aggregated, leagueSnapshot.rosters])

  const filteredFa = useMemo(() => {
    let rows = faPlayers
    if (positionFilter) rows = rows.filter((p) => p.position === positionFilter)
    return rows
  }, [faPlayers, positionFilter])

  const rosterSpotlightPlayers = useMemo(() => {
    if (compareRosterId == null) return [] as { p: AggregatedPlayer; label: string }[]
    const r = leagueSnapshot.rosters.find((x) => x.rosterId === compareRosterId)
    if (!r) return []
    const label = rosterDisplayName(r, leagueSnapshot.users)
    const out: { p: AggregatedPlayer; label: string }[] = []
    for (const sid of r.playerIds) {
      if (sid.startsWith('pick:')) continue
      const p = bySleeperId.get(sid)
      if (!p || p.position === 'PICK') continue
      if (positionFilter && p.position !== positionFilter) continue
      out.push({ p, label })
    }
    return out
  }, [bySleeperId, compareRosterId, leagueSnapshot.rosters, leagueSnapshot.users, positionFilter])

  const waiverBoardTagged = useMemo(() => {
    const faRows = filteredFa.map((p) => ({ p, label: 'FA' as string }))
    if (rosterSpotlightPlayers.length === 0) return faRows
    return [...rosterSpotlightPlayers, ...faRows]
  }, [filteredFa, rosterSpotlightPlayers])

  type FaRow = AggregatedPlayer & {
    poolSource: string
    ktcNorm: number | null
    fcNorm: number | null
    ddNorm: number | null
    avgNorm: number | null
    deltaFc: number | null
    deltaDd: number | null
    deltaAvg: number | null
  }

  const tableRows = useMemo<FaRow[]>(() => {
    return waiverBoardTagged.map(({ p, label }) => {
      const ktc = metricLane === 'dynasty' ? p.dynKtcNorm : p.rdKtcNorm
      const fc = metricLane === 'dynasty' ? p.dynFcNorm : p.rdFcNorm
      const dd = metricLane === 'dynasty' ? p.dynDdNorm : p.rdDdNorm
      const avg = metricLane === 'dynasty' ? p.dynAvgNorm : p.rdAvgNorm
      const dFc = metricLane === 'dynasty' ? p.dynDeltaNormFcVsKtc : p.rdDeltaNormFcVsKtc
      const dDd = metricLane === 'dynasty' ? p.dynDeltaNormDdVsKtc : p.rdDeltaNormDdVsKtc
      const dAvg = avg != null && ktc != null ? avg - ktc : null
      return {
        ...p,
        poolSource: label,
        ktcNorm: ktc,
        fcNorm: fc,
        ddNorm: dd,
        avgNorm: avg,
        deltaFc: dFc,
        deltaDd: dDd,
        deltaAvg: dAvg,
      }
    })
  }, [metricLane, waiverBoardTagged])

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

  const deltaHeader = (label: string, kind: 'fc' | 'dd' | 'avg') => () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{explainDelta(kind)}</TooltipContent>
    </Tooltip>
  )

  const columns = useMemo<ColumnDef<FaRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Player',
        cell: ({ row }) => (
          <div className="flex items-center gap-2" title={row.original.name}>
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
              lane="dynasty"
              minAbsDeltaPercentileCutoff={dynConsensusCutoff}
              deltaFc={row.original.dynDeltaNormFcVsKtc}
              deltaDd={row.original.dynDeltaNormDdVsKtc}
              laneLabel="Dyn"
              className="shrink-0"
            />
            <ConsensusFlag
              lane="redraft"
              minAbsDeltaPercentileCutoff={rdConsensusCutoff}
              deltaFc={row.original.rdDeltaNormFcVsKtc}
              deltaDd={row.original.rdDeltaNormDdVsKtc}
              laneLabel="Rd"
              className="shrink-0"
            />
          </div>
        ),
      },
      {
        accessorKey: 'poolSource',
        header: 'Pool',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground text-xs">{(getValue() as string) ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'team',
        header: 'NFL',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{(getValue() as string) ?? 'FA'}</span>
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
      },
      {
        accessorKey: 'avgNorm',
        header: 'Avg',
        cell: ({ getValue }) => {
          const val = getValue() as number | null
          return val != null ? <span className="font-semibold tabular-nums">{val.toLocaleString()}</span> : '—'
        },
      },
      {
        accessorKey: 'deltaAvg',
        header: deltaHeader('Δ Avg', 'avg'),
        cell: ({ getValue }) => deltaCell(getValue() as number | null),
      },
    ],
    [dynConsensusCutoff, leagueId, rdConsensusCutoff],
  )

  const table = useReactTable({
    data: tableRows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    sortDescFirst: true,
  })

  const rowModelRows = table.getRowModel().rows
  const leafColumnCount = table.getVisibleLeafColumns().length

  const positions = ['QB', 'RB', 'WR', 'TE']
  const rosterOptionsSorted = useMemo(() => {
    return [...leagueSnapshot.rosters].sort((a, b) =>
      rosterDisplayName(a, leagueSnapshot.users).localeCompare(
        rosterDisplayName(b, leagueSnapshot.users),
        undefined,
        { sensitivity: 'base' },
      ),
    )
  }, [leagueSnapshot.rosters, leagueSnapshot.users])
  const lane = laneLabel(metricLane)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-4">
      <PageSubheader className="mx-[-0.75rem] shrink-0 sm:mx-[-1rem]">
        <span className="shrink-0 text-sm font-medium">Waiver</span>
        <span className="text-muted-foreground shrink-0 text-xs sm:text-sm">Metric</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              className="h-8 shrink-0"
              variant={metricLane === 'dynasty' ? 'default' : 'outline'}
              onClick={() => setMetricLane('dynasty')}
            >
              Dynasty
            </Button>
          </TooltipTrigger>
          <TooltipContent>{explainLane('dynasty')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              className="h-8 shrink-0"
              variant={metricLane === 'redraft' ? 'default' : 'outline'}
              onClick={() => setMetricLane('redraft')}
            >
              Redraft
            </Button>
          </TooltipTrigger>
          <TooltipContent>{explainLane('redraft')}</TooltipContent>
        </Tooltip>
        <span className="text-muted-foreground ml-1 shrink-0 text-xs sm:ml-2 sm:text-sm">Scale</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              className="h-8 shrink-0"
              variant={normMode === 'max' ? 'default' : 'outline'}
              onClick={() => setNormMode('max')}
            >
              Max
            </Button>
          </TooltipTrigger>
          <TooltipContent>{explainNormMode('max')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              className="h-8 shrink-0"
              variant={normMode === 'quantile' ? 'default' : 'outline'}
              onClick={() => setNormMode('quantile')}
            >
              Quantile
            </Button>
          </TooltipTrigger>
          <TooltipContent>{explainNormMode('quantile')}</TooltipContent>
        </Tooltip>
      </PageSubheader>

      <ConsensusIndicatorSettings className="shrink-0 rounded-lg border border-border bg-muted/20 p-3" />

      <Card className="shrink-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top mispricing deltas (FA only)</CardTitle>
          <p className="text-muted-foreground text-xs">
            Top 25 FAs by Δ ({lane}). Click any column to sort.
          </p>
        </CardHeader>
        <CardContent className="border-t border-border pt-3">
          <DeltaTable
            players={faPlayers}
            lane={metricLane}
            percentileReferencePlayers={aggregated}
            topN={25}
            leagueId={leagueId}
          />
        </CardContent>
      </Card>

      <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-muted-foreground text-xs font-medium">Compare to roster</p>
          <p className="text-muted-foreground text-xs">
            Pick a team to list its players with free agents in the table below (same search and position filters).
          </p>
        </div>
        <Select
          value={compareRosterId == null ? 'none' : String(compareRosterId)}
          onValueChange={(v) => setCompareRosterId(v === 'none' ? null : Number(v))}
        >
          <SelectTrigger className="h-9 w-full min-w-[12rem] sm:w-[min(100%,20rem)]">
            <SelectValue placeholder="Choose roster" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Free agents only</SelectItem>
            {rosterOptionsSorted.map((r) => (
              <SelectItem key={r.rosterId} value={String(r.rosterId)}>
                {rosterDisplayName(r, leagueSnapshot.users)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-3">
        <Input
          placeholder="Search players..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs min-h-10"
        />
        <div className="flex flex-wrap gap-1">
          <Button
            variant={positionFilter === null ? 'default' : 'outline'}
            size="sm"
            className="min-h-10 sm:min-h-9"
            onClick={() => setPositionFilter(null)}
          >
            All
          </Button>
          {positions.map((pos) => (
            <Button
              key={pos}
              variant={positionFilter === pos ? 'default' : 'outline'}
              size="sm"
              className="min-h-10 sm:min-h-9"
              onClick={() => setPositionFilter(pos)}
            >
              {pos}
            </Button>
          ))}
        </div>
      </div>

      <div className="shrink-0 overflow-hidden rounded-md border border-border">
        <div className="spreadsheet-scroll overflow-x-auto">
          <table className="w-full min-w-[720px] caption-bottom text-sm spreadsheet-table">
            <TableHeader className="[&_tr]:border-0">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-0 hover:bg-transparent data-[state=selected]:bg-transparent">
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'cursor-pointer select-none whitespace-nowrap text-muted-foreground',
                        'sticky top-0 z-40 h-10 bg-background px-2 py-1.5',
                      )}
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
              {rowModelRows.length === 0 ? (
                <TableRow className="border-0">
                  <TableCell colSpan={leafColumnCount} className="h-24 text-center text-muted-foreground">
                    No rows match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rowModelRows.map((row) => (
                  <TableRow key={row.id} className="border-0">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
        </div>
      </div>
    </div>
  )
}
