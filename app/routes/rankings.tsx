import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { RankingsToolbar } from '@/components/rankings/rankings-toolbar'
import { ConsensusFlag } from '@/components/league/consensus-flag'
import { computeMinAbsDeltaPercentileCutoff } from '@/lib/rankings/consensus-threshold'
import { readPlayers, readValues } from '@/server/functions/read-data'
import type { LeagueUser, Roster } from '@/lib/db/schema'
import { aggregatePlayerValues, type AggregatedPlayer } from '@/lib/rankings/player-metrics'
import {
  LEAGUE_FETCHED_AT_STORAGE_KEY,
  LEAGUE_ID_STORAGE_KEY,
  notifyLeagueStorageChanged,
} from '@/lib/league-storage'
import {
  buildLeagueRosterIndex,
  classifyLeagueRow,
  FA_HIGHLIGHT_PARTS,
  isLeagueRowHighlighted,
  passesLeagueVisibility,
  rosterHighlightParts,
  type LeagueRosterIndex,
  type RowLeagueKind,
} from '@/lib/league/roster-index'
import { getLeagueRosterSnapshot, type LeagueRosterSnapshot } from '@/server/functions/sync-sleeper'
import { useUiSettings } from '@/lib/stores/ui-settings'
import type { TableMetricLane } from '@/lib/rankings/norm-source-tooltip'
import {
  mergeRankingsTableColumnVisibility,
  readRankingsGroupVisibilityFromStorage,
  RANKINGS_GROUP_COLUMN_IDS,
  writeRankingsGroupVisibilityToStorage,
} from '@/lib/rankings/rankings-column-visibility'
import { wideSpreadsheetDataColumnGroups } from '@/lib/rankings/wide-spreadsheet-data-columns'
import { passesPositionMultiFilter } from '@/lib/rankings/position-multi-filter'

const ESTIMATE_ROW_HEIGHT_PX = 36
const ROW_VIRTUAL_OVERSCAN = 32

export const Route = createFileRoute('/rankings')({
  validateSearch: (search: Record<string, unknown>) => {
    const raw = search.leagueId
    return {
      leagueId: typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined,
    }
  },
  loaderDeps: ({ search }: { search: { leagueId?: string } }) => ({
    leagueId: search.leagueId,
  }),
  loader: async ({ deps }: { deps: { leagueId?: string } }) => {
    const [players, values] = await Promise.all([readPlayers(), readValues()])
    const leagueSnapshot = deps.leagueId
      ? await getLeagueRosterSnapshot({ data: { leagueId: deps.leagueId } })
      : null
    return { players, values, leagueSnapshot }
  },
  component: RankingsPage,
})

type TablePlayer = AggregatedPlayer & { leagueKind: RowLeagueKind; leagueTeam: string | null }

function rosterDisplayName(roster: Roster, users: LeagueUser[]) {
  const u = users.find((x) => x.userId === roster.ownerId)
  return u?.teamName ?? u?.displayName ?? `Roster ${roster.rosterId}`
}

function leagueTeamLabel(sleeperId: string, index: LeagueRosterIndex, snapshot: LeagueRosterSnapshot): string | null {
  if (sleeperId.startsWith('pick:')) return 'Pick'
  const rid = index.playerToRoster.get(sleeperId)
  if (rid === undefined) return 'FA'
  const roster = snapshot.rosters.find((r) => r.rosterId === rid)
  if (!roster) return '—'
  return rosterDisplayName(roster, snapshot.users)
}

type LeagueRowVisual =
  | null
  | { kind: 'dim' }
  | { kind: 'paint'; cellBg: string; nameBorder: string }

/** Per-cell paint so sticky Player column gets the same tint as data cells (`<tr>` bg does not fill `<td>`). */
function leagueRowVisual(
  kind: RowLeagueKind,
  selectedRosterIds: Set<number>,
  highlightAvailable: boolean,
  sortedLeagueRosterIds: number[],
  hideUnhighlighted: boolean,
): LeagueRowVisual {
  const anyHighlightOn = selectedRosterIds.size > 0 || highlightAvailable
  if (!anyHighlightOn) return null
  if (kind.kind === 'neutral') return null
  const hi = isLeagueRowHighlighted(kind, selectedRosterIds, highlightAvailable)
  if (hideUnhighlighted) {
    if (!hi) return null
    if (kind.kind === 'fa') return { kind: 'paint', ...FA_HIGHLIGHT_PARTS }
    return { kind: 'paint', ...rosterHighlightParts(kind.rosterId, sortedLeagueRosterIds) }
  }
  if (hi) {
    if (kind.kind === 'fa') return { kind: 'paint', ...FA_HIGHLIGHT_PARTS }
    return { kind: 'paint', ...rosterHighlightParts(kind.rosterId, sortedLeagueRosterIds) }
  }
  return { kind: 'dim' }
}

function RankingsPage() {
  const navigate = useNavigate({ from: '/rankings' })
  const search = Route.useSearch()
  const { players, values, leagueSnapshot } = Route.useLoaderData()
  const spreadsheetScrollRef = useRef<HTMLDivElement>(null)

  const metricLane = useUiSettings((s) => s.metricLane) as TableMetricLane
  const normMode = useUiSettings((s) => s.normMode)
  const setNormMode = useUiSettings((s) => s.setNormMode)
  const hidePickRows = useUiSettings((s) => s.hidePickRows)
  const setHidePickRows = useUiSettings((s) => s.setHidePickRows)
  const hideUnhighlighted = useUiSettings((s) => s.rankingsHideUnhighlighted)
  const setHideUnhighlighted = useUiSettings((s) => s.setRankingsHideUnhighlighted)
  const rankingsDefaultLeagueId = useUiSettings((s) => s.rankingsDefaultLeagueId)
  const consensusPercentile = useUiSettings((s) => s.consensusPercentile)
  const rankingsHideRawValueColumns = useUiSettings((s) => s.rankingsHideRawValueColumns)
  const rankingsHideSourceTierColumns = useUiSettings((s) => s.rankingsHideSourceTierColumns)

  const [sorting, setSorting] = useState<SortingState>([{ id: 'dynasty_avg_norm', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [selectedPositionTags, setSelectedPositionTags] = useState<string[]>([])
  /** Rosters selected for highlight (multi-select). */
  const [highlightTeamIds, setHighlightTeamIds] = useState<number[]>([])
  const [highlightAvailable, setHighlightAvailable] = useState(false)

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

  useEffect(() => {
    if (typeof window === 'undefined' || search.leagueId) return
    let id = ''
    try {
      id = localStorage.getItem(LEAGUE_ID_STORAGE_KEY)?.trim() ?? ''
    } catch {
      /* ignore */
    }
    if (!id) id = rankingsDefaultLeagueId.trim()
    if (id) navigate({ search: { leagueId: id }, replace: true })
  }, [navigate, rankingsDefaultLeagueId, search.leagueId])

  useEffect(() => {
    const at = leagueSnapshot?.fetchedAt
    if (!at) return
    try {
      localStorage.setItem(LEAGUE_FETCHED_AT_STORAGE_KEY, at)
      notifyLeagueStorageChanged()
    } catch {
      /* ignore */
    }
  }, [leagueSnapshot?.fetchedAt])

  const prevLeagueIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const id = search.leagueId
    if (prevLeagueIdRef.current === id) return
    prevLeagueIdRef.current = id
    setHighlightTeamIds([])
    setHighlightAvailable(false)
    setHideUnhighlighted(false)
  }, [search.leagueId])

  const selectedRosterSet = useMemo(() => new Set(highlightTeamIds), [highlightTeamIds])

  const sortedLeagueRosterIds = useMemo(
    () => (leagueSnapshot?.rosters ?? []).map((r) => r.rosterId).sort((a, b) => a - b),
    [leagueSnapshot?.rosters],
  )

  const toggleHighlightTeam = (rosterId: number) => {
    setHighlightTeamIds((prev) =>
      prev.includes(rosterId) ? prev.filter((x) => x !== rosterId) : [...prev, rosterId],
    )
  }

  const clearHighlightTeams = useCallback(() => setHighlightTeamIds([]), [])

  const toggleDynastyColumns = useCallback(() => {
    const ids = ['dynasty_avg', 'dynasty_ktc', 'dynasty_dd', 'dynasty_fc'] as const
    setGroupColumnVisibility((v) => {
      const anyOn = ids.some((id) => v[id] !== false)
      const next = !anyOn
      const u = { ...v }
      for (const id of ids) u[id] = next
      return u
    })
  }, [])

  const toggleRedraftColumns = useCallback(() => {
    const ids = ['redraft_avg', 'redraft_ktc', 'redraft_dd', 'redraft_fc'] as const
    setGroupColumnVisibility((v) => {
      const anyOn = ids.some((id) => v[id] !== false)
      const next = !anyOn
      const u = { ...v }
      for (const id of ids) u[id] = next
      return u
    })
  }, [])

  const toggleLaneDiffColumns = useCallback(() => {
    setGroupColumnVisibility((v) => {
      const on = v.dynasty_redraft_diff !== false
      return { ...v, dynasty_redraft_diff: !on }
    })
  }, [])

  const aggregatedData = useMemo(
    () => aggregatePlayerValues(players, values, normMode),
    [players, values, normMode],
  )

  const dynConsensusCutoff = useMemo(
    () => computeMinAbsDeltaPercentileCutoff(aggregatedData, 'dynasty', consensusPercentile),
    [aggregatedData, consensusPercentile],
  )
  const rdConsensusCutoff = useMemo(
    () => computeMinAbsDeltaPercentileCutoff(aggregatedData, 'redraft', consensusPercentile),
    [aggregatedData, consensusPercentile],
  )

  const tableRows = useMemo((): TablePlayer[] => {
    if (!leagueSnapshot) {
      return aggregatedData.map((p) => ({
        ...p,
        leagueKind: { kind: 'neutral' as const },
        leagueTeam: null,
      }))
    }
    const index = buildLeagueRosterIndex(leagueSnapshot.rosters)
    return aggregatedData.map((p) => ({
      ...p,
      leagueKind: classifyLeagueRow(p.sleeperId, index),
      leagueTeam: leagueTeamLabel(p.sleeperId, index, leagueSnapshot),
    }))
  }, [aggregatedData, leagueSnapshot])

  const filteredData = useMemo(() => {
    let rows = tableRows.filter((p) =>
      passesPositionMultiFilter(p, selectedPositionTags, hidePickRows),
    )
    if (leagueSnapshot && hideUnhighlighted) {
      rows = rows.filter(({ leagueKind }) =>
        passesLeagueVisibility(leagueKind, selectedRosterSet, highlightAvailable, hideUnhighlighted),
      )
    }
    return rows
  }, [
    tableRows,
    hidePickRows,
    selectedPositionTags,
    leagueSnapshot,
    hideUnhighlighted,
    selectedRosterSet,
    highlightAvailable,
  ])


  const columns = useMemo((): ColumnDef<TablePlayer>[] => {
    return [
      {
        accessorKey: 'name',
        header: 'Player',
        cell: ({ row }) => {
          const p = row.original
          return (
            <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
              <Link
                to="/player/$sleeperId"
                params={{ sleeperId: p.sleeperId }}
                search={{ leagueId: search.leagueId as string | undefined }}
                className="font-medium hover:underline"
              >
                {p.name}
              </Link>
              {p.position ? (
                <Badge variant="outline" className="text-xs">
                  {p.position}
                </Badge>
              ) : null}
              <ConsensusFlag
                lane="dynasty"
                minAbsDeltaPercentileCutoff={dynConsensusCutoff}
                deltaFc={p.dynDeltaNormFcVsKtc}
                deltaDd={p.dynDeltaNormDdVsKtc}
                laneLabel="Dyn"
                className="shrink-0"
              />
              <ConsensusFlag
                lane="redraft"
                minAbsDeltaPercentileCutoff={rdConsensusCutoff}
                deltaFc={p.rdDeltaNormFcVsKtc}
                deltaDd={p.rdDeltaNormDdVsKtc}
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
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{(getValue() as string) ?? 'FA'}</span>
        ),
      },
      {
        accessorKey: 'leagueTeam',
        header: 'League team',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{(getValue() as string | null) ?? '—'}</span>
        ),
      },
      ...(wideSpreadsheetDataColumnGroups({ metricLane }) as ColumnDef<TablePlayer>[]),
    ]

  }, [dynConsensusCutoff, metricLane, rdConsensusCutoff, search.leagueId])

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
    data: filteredData,
    columns,
    state: { sorting, globalFilter, columnVisibility: mergedColumnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const rowModelRows = table.getRowModel().rows
  const leafColumnCount = table.getVisibleLeafColumns().length

  const rowVirtualizer = useVirtualizer({
    count: rowModelRows.length,
    getScrollElement: () => spreadsheetScrollRef.current,
    estimateSize: () => ESTIMATE_ROW_HEIGHT_PX,
    overscan: ROW_VIRTUAL_OVERSCAN,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const padTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const padBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0

  const dynastyGroupVisible = ['dynasty_avg', 'dynasty_ktc', 'dynasty_dd', 'dynasty_fc'].some(
    (id) => groupColumnVisibility[id] !== false,
  )
  const redraftGroupVisible = ['redraft_avg', 'redraft_ktc', 'redraft_dd', 'redraft_fc'].some(
    (id) => groupColumnVisibility[id] !== false,
  )
  const laneDiffGroupVisible = groupColumnVisibility.dynasty_redraft_diff !== false

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-4 pt-2 sm:px-4">
      <div className="shrink-0 -mx-3 sm:-mx-4">
        <RankingsToolbar
          leagueSnapshot={leagueSnapshot}
          searchLeagueId={search.leagueId}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          selectedPositionTags={selectedPositionTags}
          onSelectedPositionTagsChange={setSelectedPositionTags}
          normMode={normMode}
          onNormModeChange={setNormMode}
          hidePickRows={hidePickRows}
          onHidePickRowsChange={setHidePickRows}
          dynastyGroupVisible={dynastyGroupVisible}
          redraftGroupVisible={redraftGroupVisible}
          onToggleDynastyColumns={toggleDynastyColumns}
          onToggleRedraftColumns={toggleRedraftColumns}
          laneDiffGroupVisible={laneDiffGroupVisible}
          onToggleLaneDiffColumns={toggleLaneDiffColumns}
          highlightAvailable={highlightAvailable}
          onHighlightAvailableChange={setHighlightAvailable}
          highlightTeamIds={highlightTeamIds}
          onToggleHighlightTeam={toggleHighlightTeam}
          onClearHighlightTeams={clearHighlightTeams}
          hideUnhighlighted={hideUnhighlighted}
          onHideUnhighlightedChange={setHideUnhighlighted}
        />
      </div>

      {aggregatedData.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          No player values synced yet. Run <code className="rounded bg-muted px-1 py-0.5 text-xs">pnpm sync</code> or use the Sync page.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col border border-border">
          <div ref={spreadsheetScrollRef} className="spreadsheet-scroll min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1580px] caption-bottom spreadsheet-table">
              <TableHeader className="[&_tr]:border-0">
                {table.getHeaderGroups().map((headerGroup, headerRowIndex) => (
                  <TableRow
                    key={headerGroup.id}
                    className="border-0 hover:bg-transparent data-[state=selected]:bg-transparent"
                  >
                    {headerGroup.headers.map((header) => {
                      return (
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
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc' ? ' ↑' : ''}
                          {header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                        </TableHead>
                      )
                    })}
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
                  const kind = row.original.leagueKind
                  const leagueActive = leagueSnapshot != null
                  const lv = leagueActive
                    ? leagueRowVisual(
                        kind,
                        selectedRosterSet,
                        highlightAvailable,
                        sortedLeagueRosterIds,
                        hideUnhighlighted,
                      )
                    : null
                  return (
                    <TableRow
                      key={row.id}
                      className="border-0"
                      style={{ height: vr.size }}
                      data-index={vr.index}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            'whitespace-nowrap',
                            cell.column.id === 'name' && 'spreadsheet-sticky-name font-medium',
                            lv?.kind === 'paint' && lv.cellBg,
                            lv?.kind === 'paint' && cell.column.id === 'name' && lv.nameBorder,
                            lv?.kind === 'dim' && 'opacity-[0.38]',
                          )}
                        >
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
      )}
    </div>
  )
}
