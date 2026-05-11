import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { PageSubheader } from '@/components/ui/page-subheader'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLeagueRoute } from '@/lib/league-route-context'
import type { LeagueUser, Roster } from '@/lib/db/schema'
import { aggregatePlayerValues, type AggregatedPlayer } from '@/lib/rankings/player-metrics'
import { depthTierByPlayerId } from '@/lib/rankings/league-board-depth'
import { cn } from '@/lib/utils'
import { ConsensusFlag } from '@/components/league/consensus-flag'
import { computeMinAbsDeltaPercentileCutoff } from '@/lib/rankings/consensus-threshold'
import { useUiSettings } from '@/lib/stores/ui-settings'
import { laneLabel } from '@/lib/rankings/explain'
import type { TableMetricLane } from '@/lib/rankings/norm-source-tooltip'
import {
  mergeRankingsTableColumnVisibility,
  readRankingsGroupVisibilityFromStorage,
  RANKINGS_GROUP_COLUMN_IDS,
  writeRankingsGroupVisibilityToStorage,
} from '@/lib/rankings/rankings-column-visibility'
import { wideSpreadsheetDataColumnGroups } from '@/lib/rankings/wide-spreadsheet-data-columns'
import { PositionMultiFilter } from '@/components/rankings/position-multi-filter'
import { passesPositionMultiFilter } from '@/lib/rankings/position-multi-filter'

function rosterDisplayName(roster: Roster, users: LeagueUser[]) {
  const u = users.find((x) => x.userId === roster.ownerId)
  return u?.teamName ?? u?.displayName ?? `Roster ${roster.rosterId}`
}

function ownerDisplayName(roster: Roster, users: LeagueUser[]) {
  const u = users.find((x) => x.userId === roster.ownerId)
  return u?.displayName ?? null
}

function isPick(p: AggregatedPlayer) {
  return p.sleeperId.startsWith('pick:') || p.position === 'PICK'
}

type TeamRosterSortSource = 'avg' | 'ktc' | 'fc' | 'dd'

function sortAccessorId(lane: TableMetricLane, source: TeamRosterSortSource): string {
  const block = lane === 'dynasty' ? 'dynasty' : 'redraft'
  if (source === 'avg') return `${block}_avg_norm`
  if (source === 'ktc') return `${block}_ktc_norm`
  if (source === 'fc') return `${block}_fc_norm`
  return `${block}_dd_norm`
}

export const Route = createFileRoute('/league/$leagueId/team/$rosterId')({
  component: TeamPage,
})

function TeamPage() {
  const { leagueId, rosterId: rosterIdParam } = Route.useParams()
  const { players, values, leagueSnapshot } = useLeagueRoute()

  const rosterIdNum = Number(rosterIdParam)
  const roster =
    Number.isFinite(rosterIdNum) ? leagueSnapshot.rosters.find((r) => r.rosterId === rosterIdNum) : undefined
  if (!roster) throw notFound()

  const metricLane = useUiSettings((s) => s.metricLane) as TableMetricLane
  const normMode = useUiSettings((s) => s.normMode)
  const hidePickRows = useUiSettings((s) => s.hidePickRows)
  const rankingsHideRawValueColumns = useUiSettings((s) => s.rankingsHideRawValueColumns)
  const rankingsHideSourceTierColumns = useUiSettings((s) => s.rankingsHideSourceTierColumns)

  const [groupColumnVisibility, setGroupColumnVisibility] = useState<VisibilityState>(() =>
    typeof window === 'undefined' ? {} : readRankingsGroupVisibilityFromStorage(),
  )

  useEffect(() => {
    const loaded = readRankingsGroupVisibilityFromStorage()
    if (Object.keys(loaded).length > 0) setGroupColumnVisibility(loaded)
  }, [])

  useEffect(() => {
    writeRankingsGroupVisibilityToStorage(groupColumnVisibility)
  }, [groupColumnVisibility])

  const mergedColumnVisibility = useMemo(
    () =>
      mergeRankingsTableColumnVisibility(
        groupColumnVisibility,
        rankingsHideRawValueColumns,
        rankingsHideSourceTierColumns,
      ),
    [groupColumnVisibility, rankingsHideRawValueColumns, rankingsHideSourceTierColumns],
  )

  const [teamRosterSortSource, setTeamRosterSortSource] = useState<TeamRosterSortSource>('avg')
  const [selectedPositionTags, setSelectedPositionTags] = useState<string[]>([])
  const [sorting, setSorting] = useState<SortingState>([
    { id: sortAccessorId(metricLane, 'avg'), desc: true },
  ])

  useEffect(() => {
    setSorting([{ id: sortAccessorId(metricLane, teamRosterSortSource), desc: true }])
  }, [metricLane, teamRosterSortSource])

  const aggregated = useMemo(
    () => aggregatePlayerValues(players, values, normMode),
    [players, values, normMode],
  )
  const bySleeperId = useMemo(() => new Map(aggregated.map((p) => [p.sleeperId, p])), [aggregated])

  const consensusPercentileSetting = useUiSettings((s) => s.consensusPercentile)
  const dynConsensusCutoff = useMemo(
    () => computeMinAbsDeltaPercentileCutoff(aggregated, 'dynasty', consensusPercentileSetting),
    [aggregated, consensusPercentileSetting],
  )
  const rdConsensusCutoff = useMemo(
    () => computeMinAbsDeltaPercentileCutoff(aggregated, 'redraft', consensusPercentileSetting),
    [aggregated, consensusPercentileSetting],
  )

  const rosterPlayers = useMemo(() => {
    const out: AggregatedPlayer[] = []
    for (const id of roster.playerIds) {
      const m = bySleeperId.get(id)
      if (!m) continue
      if (hidePickRows && isPick(m)) continue
      out.push(m)
    }
    return out
  }, [roster.playerIds, bySleeperId, hidePickRows])

  const rosterTableRows = useMemo(
    () => rosterPlayers.filter((m) => passesPositionMultiFilter(m, selectedPositionTags, false)),
    [rosterPlayers, selectedPositionTags],
  )

  const depthMap = useMemo(
    () => depthTierByPlayerId(rosterPlayers.filter((p) => !isPick(p)), metricLane),
    [rosterPlayers, metricLane],
  )

  const columns = useMemo((): ColumnDef<AggregatedPlayer>[] => {
    return [
      {
        accessorKey: 'name',
        header: 'Player',
        cell: ({ row }) => {
          const depthTier = depthMap.get(row.original.sleeperId) ?? 'bench'
          return (
            <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
              {isPick(row.original) ? (
                <span className="font-medium">{row.original.name}</span>
              ) : (
                <Link
                  to="/player/$sleeperId"
                  params={{ sleeperId: row.original.sleeperId }}
                  search={{ leagueId }}
                  className="font-medium hover:underline"
                >
                  {row.original.name}
                </Link>
              )}
              {row.original.position ? (
                <Badge variant="outline" className="text-xs">
                  {row.original.position}
                </Badge>
              ) : null}
              {!isPick(row.original) ? (
                <Badge
                  variant={depthTier === 'starter' ? 'default' : depthTier === 'backup' ? 'secondary' : 'outline'}
                  className="text-[10px]"
                >
                  {depthTier === 'starter' ? 'Starter' : depthTier === 'backup' ? 'Backup' : 'Bench'}
                </Badge>
              ) : null}
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
          )
        },
      },
      {
        accessorKey: 'team',
        header: 'Team',
        cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) ?? 'FA'}</span>,
      },
      ...wideSpreadsheetDataColumnGroups({ metricLane }),
    ]
  }, [depthMap, dynConsensusCutoff, leagueId, metricLane, rdConsensusCutoff])

  const onColumnVisibilityChange = useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setGroupColumnVisibility((prevGroups) => {
        const prevMerged = mergeRankingsTableColumnVisibility(
          prevGroups,
          rankingsHideRawValueColumns,
          rankingsHideSourceTierColumns,
        )
        const nextFull = typeof updater === 'function' ? updater(prevMerged) : updater
        const nextGroups: VisibilityState = { ...prevGroups }
        for (const id of RANKINGS_GROUP_COLUMN_IDS) {
          if (id in nextFull) nextGroups[id] = nextFull[id]
        }
        return nextGroups
      })
    },
    [rankingsHideRawValueColumns, rankingsHideSourceTierColumns],
  )

  const table = useReactTable({
    data: rosterTableRows,
    columns,
    state: { sorting, columnVisibility: mergedColumnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const teamLabel = rosterDisplayName(roster, leagueSnapshot.users)
  const owner = ownerDisplayName(roster, leagueSnapshot.users)
  const lane = laneLabel(metricLane)
  const leafColumnCount = table.getVisibleLeafColumns().length

  const record = `${roster.wins}-${roster.losses}${roster.ties ? `-${roster.ties}` : ''}`

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-4 sm:px-4">
      <PageSubheader className="mx-[-0.75rem] sm:mx-[-1rem]">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate font-medium leading-tight">{teamLabel}</span>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{record}</span>
          {owner ? (
            <span className="text-muted-foreground hidden min-w-0 truncate text-xs sm:inline">{owner}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground hidden text-xs sm:inline">Sort</span>
          <Select
            value={teamRosterSortSource}
            onValueChange={(v) => setTeamRosterSortSource(v as TeamRosterSortSource)}
          >
            <SelectTrigger size="sm" className="h-8 w-[8.25rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="avg">Avg</SelectItem>
              <SelectItem value="ktc">KTC</SelectItem>
              <SelectItem value="fc">FantasyCalc</SelectItem>
              <SelectItem value="dd">{metricLane === 'dynasty' ? 'Dynasty Daddy' : 'ADP Daddy'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
          {lane} · {normMode}
          {hidePickRows ? ' · no picks' : ''}
        </span>
      </PageSubheader>

      <div className="flex shrink-0 flex-wrap items-center gap-2 px-0.5">
        <PositionMultiFilter selected={selectedPositionTags} onChange={setSelectedPositionTags} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col border border-border">
        <div className="spreadsheet-scroll min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1580px] caption-bottom spreadsheet-table">
            <TableHeader className="[&_tr]:border-0">
              {table.getHeaderGroups().map((headerGroup, headerRowIndex) => (
                <TableRow key={headerGroup.id} className="border-0 hover:bg-transparent data-[state=selected]:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      rowSpan={header.rowSpan > 1 ? header.rowSpan : undefined}
                      className={cn(
                        'sticky h-10 cursor-pointer select-none bg-muted px-2 py-1.5 align-bottom font-medium text-muted-foreground',
                        header.column.id === 'name' && 'spreadsheet-sticky-name text-foreground',
                      )}
                      style={{
                        top: headerRowIndex * 40,
                        zIndex: header.column.id === 'name' ? 70 : 45 - headerRowIndex,
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' ? ' ↑' : ''}
                      {header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={leafColumnCount} className="h-24 text-center text-muted-foreground">
                    No valued roster rows to display.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="border-0">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'whitespace-nowrap',
                          cell.column.id === 'name' && 'spreadsheet-sticky-name font-medium',
                        )}
                      >
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
