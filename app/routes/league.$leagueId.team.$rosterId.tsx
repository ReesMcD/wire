import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { PageSubheader } from '@/components/ui/page-subheader'
import { Badge } from '@/components/ui/badge'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLeagueRoute } from '@/lib/league-route-context'
import type { LeagueUser, Roster } from '@/lib/db/schema'
import { aggregatePlayerValues, type AggregatedPlayer } from '@/lib/rankings/player-metrics'
import { depthTierByPlayerId } from '@/lib/rankings/league-board-depth'
import { cn } from '@/lib/utils'
import { ConsensusFlag } from '@/components/league/consensus-flag'
import { computeMinAbsDeltaPercentileCutoff } from '@/lib/rankings/consensus-threshold'
import { formatPosRankLabel } from '@/lib/rankings/neighbor-lists'
import { useUiSettings } from '@/lib/stores/ui-settings'
import { laneLabel } from '@/lib/rankings/explain'

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

const tierCell = (val: number | null) =>
  val !== null ? <Badge variant="secondary">T{val}</Badge> : '-'

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

  const metricLane = useUiSettings((s) => s.metricLane)
  const normMode = useUiSettings((s) => s.normMode)
  const hidePickRows = useUiSettings((s) => s.hidePickRows)
  const [sorting, setSorting] = useState<SortingState>([
    { id: metricLane === 'dynasty' ? 'dynAvgNorm' : 'rdAvgNorm', desc: true },
  ])

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

  const depthMap = useMemo(
    () => depthTierByPlayerId(rosterPlayers.filter((p) => !isPick(p)), metricLane),
    [rosterPlayers, metricLane],
  )

  const columns = useMemo((): ColumnDef<AggregatedPlayer>[] => {
    const normCell = (val: number | null) => (val !== null ? val.toLocaleString() : '-')
    const rawCell = (val: number | null) => (
      <span className="text-muted-foreground">{val !== null ? val.toLocaleString() : '-'}</span>
    )
    const deltaPtsCell = (val: number | null) => {
      if (val === null) return '-'
      const text = val > 0 ? `+${val.toLocaleString()}` : val.toLocaleString()
      return <span className="text-muted-foreground">{text}</span>
    }
    const rankCellDynKtc = (p: AggregatedPlayer, rank: number | null, posRank: number | null) => (
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span>{rank !== null ? `#${rank}` : '—'}</span>
        {posRank != null && rank !== null ? (
          <span className="text-muted-foreground text-xs">{formatPosRankLabel(p.position, posRank)}</span>
        ) : null}
      </div>
    )
    const rankCellRdKtc = (p: AggregatedPlayer, rank: number | null, posRank: number | null) => (
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span>{rank !== null ? `#${rank}` : '—'}</span>
        {posRank != null && rank !== null ? (
          <span className="text-muted-foreground text-xs">{formatPosRankLabel(p.position, posRank)}</span>
        ) : null}
      </div>
    )
    const rankCellSimple = (p: AggregatedPlayer, rank: number | null, posRank: number | null) => (
      <div className="flex items-center gap-1 whitespace-nowrap">
        <span>{rank !== null ? `#${rank}` : '—'}</span>
        {posRank != null && rank !== null ? (
          <span className="text-muted-foreground text-xs">{formatPosRankLabel(p.position, posRank)}</span>
        ) : null}
      </div>
    )

    return [
      {
        accessorKey: 'name',
        header: 'Player',
        cell: ({ row }) => {
          const depthTier = depthMap.get(row.original.sleeperId) ?? 'bench'
          return (
            <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
              <Link
                to="/player/$sleeperId"
                params={{ sleeperId: row.original.sleeperId }}
                search={{ leagueId }}
                className="font-medium hover:underline"
              >
                {row.original.name}
              </Link>
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
                player={row.original}
                laneLabel="Dyn"
                className="shrink-0"
              />
              <ConsensusFlag
                lane="redraft"
                minAbsDeltaPercentileCutoff={rdConsensusCutoff}
                deltaFc={row.original.rdDeltaNormFcVsKtc}
                deltaDd={row.original.rdDeltaNormDdVsKtc}
                player={row.original}
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
      {
        id: 'dynasty_ktc',
        header: 'KTC Dynasty',
        columns: [
          {
            accessorKey: 'dynKtcRank',
            header: 'KTC #',
            cell: ({ row, getValue }) =>
              rankCellDynKtc(row.original, getValue() as number | null, row.original.dynKtcPosRank),
          },
          { accessorKey: 'dynKtcValue', header: 'KTC raw', cell: ({ getValue }) => rawCell(getValue() as number | null) },
          { accessorKey: 'dynKtcNorm', header: 'KTC norm', cell: ({ getValue }) => normCell(getValue() as number | null) },
          { accessorKey: 'dynTierKtc', header: 'T KTC', cell: ({ getValue }) => tierCell(getValue() as number | null) },
        ],
      },
      {
        id: 'dynasty_dd',
        header: 'Dynasty Daddy',
        columns: [
          {
            accessorKey: 'dynDdRank',
            header: 'DD #',
            cell: ({ row, getValue }) =>
              rankCellSimple(row.original, getValue() as number | null, row.original.dynDdPosRank),
          },
          { accessorKey: 'dynDdValue', header: 'DD raw', cell: ({ getValue }) => rawCell(getValue() as number | null) },
          { accessorKey: 'dynDdNorm', header: 'DD norm', cell: ({ getValue }) => normCell(getValue() as number | null) },
          { accessorKey: 'dynTierDd', header: 'T DD', cell: ({ getValue }) => tierCell(getValue() as number | null) },
          { accessorKey: 'dynDeltaNormDdVsKtc', header: 'Δ pts DD', cell: ({ getValue }) => deltaPtsCell(getValue() as number | null) },
        ],
      },
      {
        id: 'dynasty_fc',
        header: 'FantasyCalc Dynasty',
        columns: [
          {
            accessorKey: 'dynFcRank',
            header: 'FC #',
            cell: ({ row, getValue }) =>
              rankCellSimple(row.original, getValue() as number | null, row.original.dynFcPosRank),
          },
          { accessorKey: 'dynFcValue', header: 'FC raw', cell: ({ getValue }) => rawCell(getValue() as number | null) },
          { accessorKey: 'dynFcNorm', header: 'FC norm', cell: ({ getValue }) => normCell(getValue() as number | null) },
          { accessorKey: 'dynTierFc', header: 'T FC', cell: ({ getValue }) => tierCell(getValue() as number | null) },
          { accessorKey: 'dynDeltaNormFcVsKtc', header: 'Δ pts', cell: ({ getValue }) => deltaPtsCell(getValue() as number | null) },
        ],
      },
      {
        id: 'dynasty_avg',
        header: 'Avg Dynasty',
        columns: [
          {
            accessorKey: 'dynAvgNorm',
            header: 'Avg',
            cell: ({ row, getValue }) => {
              const val = getValue() as number | null
              if (val === null) return '-'
              return (
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="font-semibold">{val.toLocaleString()}</span>
                  {row.original.dynAvgPosRank != null ? (
                    <span className="text-muted-foreground text-xs">
                      {formatPosRankLabel(row.original.position, row.original.dynAvgPosRank)}
                    </span>
                  ) : null}
                </div>
              )
            },
          },
          { accessorKey: 'dynTierAvg', header: 'Tier Σ', cell: ({ getValue }) => tierCell(getValue() as number | null) },
        ],
      },
      {
        id: 'redraft_ktc',
        header: 'KTC Redraft',
        columns: [
          {
            accessorKey: 'rdKtcRank',
            header: 'KTC #',
            cell: ({ row, getValue }) =>
              rankCellRdKtc(row.original, getValue() as number | null, row.original.rdKtcPosRank),
          },
          { accessorKey: 'rdKtcValue', header: 'KTC raw', cell: ({ getValue }) => rawCell(getValue() as number | null) },
          { accessorKey: 'rdKtcNorm', header: 'KTC norm', cell: ({ getValue }) => normCell(getValue() as number | null) },
          { accessorKey: 'rdTierKtc', header: 'T KTC', cell: ({ getValue }) => tierCell(getValue() as number | null) },
        ],
      },
      {
        id: 'redraft_dd',
        header: 'ADP Daddy',
        columns: [
          {
            accessorKey: 'rdDdRank',
            header: 'ADP #',
            cell: ({ row, getValue }) =>
              rankCellSimple(row.original, getValue() as number | null, row.original.rdDdPosRank),
          },
          { accessorKey: 'rdDdValue', header: 'ADP raw', cell: ({ getValue }) => rawCell(getValue() as number | null) },
          { accessorKey: 'rdDdNorm', header: 'ADP norm', cell: ({ getValue }) => normCell(getValue() as number | null) },
          { accessorKey: 'rdTierDd', header: 'T ADP', cell: ({ getValue }) => tierCell(getValue() as number | null) },
          { accessorKey: 'rdDeltaNormDdVsKtc', header: 'Δ pts ADP', cell: ({ getValue }) => deltaPtsCell(getValue() as number | null) },
        ],
      },
      {
        id: 'redraft_fc',
        header: 'FantasyCalc Redraft',
        columns: [
          {
            accessorKey: 'rdFcRank',
            header: 'FC #',
            cell: ({ row, getValue }) =>
              rankCellSimple(row.original, getValue() as number | null, row.original.rdFcPosRank),
          },
          { accessorKey: 'rdFcValue', header: 'FC raw', cell: ({ getValue }) => rawCell(getValue() as number | null) },
          { accessorKey: 'rdFcNorm', header: 'FC norm', cell: ({ getValue }) => normCell(getValue() as number | null) },
          { accessorKey: 'rdTierFc', header: 'T FC', cell: ({ getValue }) => tierCell(getValue() as number | null) },
          { accessorKey: 'rdDeltaNormFcVsKtc', header: 'Δ pts', cell: ({ getValue }) => deltaPtsCell(getValue() as number | null) },
        ],
      },
      {
        id: 'redraft_avg',
        header: 'Avg Redraft',
        columns: [
          {
            accessorKey: 'rdAvgNorm',
            header: 'Avg',
            cell: ({ row, getValue }) => {
              const val = getValue() as number | null
              if (val === null) return '-'
              return (
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="font-semibold">{val.toLocaleString()}</span>
                  {row.original.rdAvgPosRank != null ? (
                    <span className="text-muted-foreground text-xs">
                      {formatPosRankLabel(row.original.position, row.original.rdAvgPosRank)}
                    </span>
                  ) : null}
                </div>
              )
            },
          },
          { accessorKey: 'rdTierAvg', header: 'Tier Σ', cell: ({ getValue }) => tierCell(getValue() as number | null) },
        ],
      },
    ]
  }, [depthMap, dynConsensusCutoff, leagueId, rdConsensusCutoff])

  const table = useReactTable({
    data: rosterPlayers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const teamLabel = rosterDisplayName(roster, leagueSnapshot.users)
  const owner = ownerDisplayName(roster, leagueSnapshot.users)
  const lane = laneLabel(metricLane)
  const leafColumnCount = table.getAllLeafColumns().length

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
        <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
          {lane} · {normMode}
          {hidePickRows ? ' · no picks' : ''}
        </span>
      </PageSubheader>

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
