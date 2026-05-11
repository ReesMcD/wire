import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
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

const ESTIMATE_ROW_HEIGHT_PX = 36

function rosterDisplayName(roster: Roster, users: LeagueUser[]) {
  const u = users.find((x) => x.userId === roster.ownerId)
  return u?.teamName ?? u?.displayName ?? `Roster ${roster.rosterId}`
}

export const Route = createFileRoute('/league/$leagueId/waiver')({
  component: WaiverPage,
})

function WaiverPage() {
  const { leagueId, players, values, leagueSnapshot } = useLeagueRoute()
  const scrollRef = useRef<HTMLDivElement>(null)

  const metricLane = useUiSettings((s) => s.metricLane)
  const setMetricLane = useUiSettings((s) => s.setMetricLane)
  const normMode = useUiSettings((s) => s.normMode)
  const setNormMode = useUiSettings((s) => s.setNormMode)

  const [globalFilter, setGlobalFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState<string | null>(null)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'avgNorm', desc: true }])
  const [highlightTeamIds, setHighlightTeamIds] = useState<number[]>([])

  const aggregated = useMemo(
    () => aggregatePlayerValues(players, values, normMode),
    [players, values, normMode],
  )

  const consensusPercentileSetting = useUiSettings((s) => s.consensusPercentile)
  const consensusCutoffLane = useMemo(
    () => computeMinAbsDeltaPercentileCutoff(aggregated, metricLane, consensusPercentileSetting),
    [aggregated, metricLane, consensusPercentileSetting],
  )

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

  const toggleHighlightTeam = (rosterId: number) => {
    setHighlightTeamIds((prev) =>
      prev.includes(rosterId) ? prev.filter((x) => x !== rosterId) : [...prev, rosterId],
    )
  }

  type FaRow = AggregatedPlayer & {
    ktcNorm: number | null
    fcNorm: number | null
    ddNorm: number | null
    avgNorm: number | null
    deltaFc: number | null
    deltaDd: number | null
    deltaAvg: number | null
  }

  const tableRows = useMemo<FaRow[]>(() => {
    return filteredFa.map((p) => {
      const ktc = metricLane === 'dynasty' ? p.dynKtcNorm : p.rdKtcNorm
      const fc = metricLane === 'dynasty' ? p.dynFcNorm : p.rdFcNorm
      const dd = metricLane === 'dynasty' ? p.dynDdNorm : p.rdDdNorm
      const avg = metricLane === 'dynasty' ? p.dynAvgNorm : p.rdAvgNorm
      const dFc = metricLane === 'dynasty' ? p.dynDeltaNormFcVsKtc : p.rdDeltaNormFcVsKtc
      const dDd = metricLane === 'dynasty' ? p.dynDeltaNormDdVsKtc : p.rdDeltaNormDdVsKtc
      const dAvg = avg != null && ktc != null ? avg - ktc : null
      return {
        ...p,
        ktcNorm: ktc,
        fcNorm: fc,
        ddNorm: dd,
        avgNorm: avg,
        deltaFc: dFc,
        deltaDd: dDd,
        deltaAvg: dAvg,
      }
    })
  }, [filteredFa, metricLane])

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
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.position && (
              <Badge variant="outline" className="text-xs">
                {row.original.position}
              </Badge>
            )}
            <ConsensusFlag
              lane={metricLane}
              player={row.original}
              minAbsDeltaPercentileCutoff={consensusCutoffLane}
              deltaFc={row.original.deltaFc}
              deltaDd={row.original.deltaDd}
            />
          </div>
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
    [consensusCutoffLane, metricLane],
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
  const leafColumnCount = table.getAllLeafColumns().length

  const rowVirtualizer = useVirtualizer({
    count: rowModelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATE_ROW_HEIGHT_PX,
    overscan: 12,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const padTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const padBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0

  const positions = ['QB', 'RB', 'WR', 'TE']
  const rosterOptions = leagueSnapshot.rosters
  const lane = laneLabel(metricLane)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-4 sm:px-4">
      <PageSubheader className="mx-[-0.75rem] sm:mx-[-1rem]">
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
          />
        </CardContent>
      </Card>

      <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-muted-foreground text-xs font-medium">Highlight</p>
        <div className="flex flex-wrap gap-2">
          {rosterOptions.map((r) => (
            <Button
              key={r.rosterId}
              type="button"
              size="sm"
              className="min-h-9 max-w-[220px] truncate"
              variant={highlightTeamIds.includes(r.rosterId) ? 'default' : 'outline'}
              title={`${rosterDisplayName(r, leagueSnapshot.users)} (${r.rosterId})`}
              onClick={() => toggleHighlightTeam(r.rosterId)}
            >
              {rosterDisplayName(r, leagueSnapshot.users)}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Team toggles persist for parity with Rankings; on the FA-only list they’re cosmetic.
        </p>
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <table className="w-full caption-bottom text-sm">
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
              {padTop > 0 && (
                <TableRow className="border-0 hover:bg-transparent data-[state=selected]:bg-transparent">
                  <TableCell colSpan={leafColumnCount} className="p-0" style={{ height: padTop }} />
                </TableRow>
              )}
              {virtualRows.map((vr) => {
                const row = rowModelRows[vr.index]
                return (
                  <TableRow key={row.id} className="border-0" style={{ height: vr.size }} data-index={vr.index}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
              {padBottom > 0 && (
                <TableRow className="border-0 hover:bg-transparent data-[state=selected]:bg-transparent">
                  <TableCell colSpan={leafColumnCount} className="p-0" style={{ height: padBottom }} />
                </TableRow>
              )}
            </TableBody>
          </table>
        </div>
      </div>
    </div>
  )
}
