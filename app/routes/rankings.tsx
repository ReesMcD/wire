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
import { formatPosRankLabel } from '@/lib/rankings/neighbor-lists'
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

const COLUMN_VISIBILITY_STORAGE_KEY = 'rankings-column-visibility'

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

  const normMode = useUiSettings((s) => s.normMode)
  const setNormMode = useUiSettings((s) => s.setNormMode)
  const hidePickRows = useUiSettings((s) => s.hidePickRows)
  const setHidePickRows = useUiSettings((s) => s.setHidePickRows)
  const hideUnhighlighted = useUiSettings((s) => s.rankingsHideUnhighlighted)
  const setHideUnhighlighted = useUiSettings((s) => s.setRankingsHideUnhighlighted)
  const rankingsDefaultLeagueId = useUiSettings((s) => s.rankingsDefaultLeagueId)
  const consensusPercentile = useUiSettings((s) => s.consensusPercentile)

  const [sorting, setSorting] = useState<SortingState>([{ id: 'dynAvgNorm', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState<string | null>(null)
  /** Rosters selected for highlight (multi-select). */
  const [highlightTeamIds, setHighlightTeamIds] = useState<number[]>([])
  const [highlightAvailable, setHighlightAvailable] = useState(false)

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})


  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY)
      if (!raw) return
      const j = JSON.parse(raw) as Record<string, unknown>
      const next: VisibilityState = {}
      const keys = [
        'dynasty_ktc',
        'dynasty_dd',
        'dynasty_fc',
        'dynasty_avg',
        'redraft_ktc',
        'redraft_dd',
        'redraft_fc',
        'redraft_avg',
      ] as const
      for (const k of keys) {
        if (typeof j[k] === 'boolean') next[k] = j[k] as boolean
      }
      if (Object.keys(next).length === 0) {
        if (typeof j.dynasty === 'boolean') {
          const on = j.dynasty as boolean
          next.dynasty_ktc = on
          next.dynasty_dd = on
          next.dynasty_fc = on
          next.dynasty_avg = on
        }
        if (typeof j.redraft === 'boolean') {
          const on = j.redraft as boolean
          next.redraft_ktc = on
          next.redraft_dd = on
          next.redraft_fc = on
          next.redraft_avg = on
        }
      }
      setColumnVisibility(next)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      const ids = [
        'dynasty_ktc',
        'dynasty_dd',
        'dynasty_fc',
        'dynasty_avg',
        'redraft_ktc',
        'redraft_dd',
        'redraft_fc',
        'redraft_avg',
      ] as const
      const payload: Record<string, boolean> = {}
      for (const id of ids) {
        payload[id] = columnVisibility[id] !== false
      }
      localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      /* ignore */
    }
  }, [columnVisibility])

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
    const ids = ['dynasty_ktc', 'dynasty_dd', 'dynasty_fc', 'dynasty_avg'] as const
    setColumnVisibility((v) => {
      const anyOn = ids.some((id) => v[id] !== false)
      const next = !anyOn
      const u = { ...v }
      for (const id of ids) u[id] = next
      return u
    })
  }, [])

  const toggleRedraftColumns = useCallback(() => {
    const ids = ['redraft_ktc', 'redraft_dd', 'redraft_fc', 'redraft_avg'] as const
    setColumnVisibility((v) => {
      const anyOn = ids.some((id) => v[id] !== false)
      const next = !anyOn
      const u = { ...v }
      for (const id of ids) u[id] = next
      return u
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
    let rows = tableRows
    if (hidePickRows) rows = rows.filter((p) => p.position !== 'PICK')
    if (positionFilter) rows = rows.filter((p) => p.position === positionFilter)
    if (leagueSnapshot && hideUnhighlighted) {
      rows = rows.filter(({ leagueKind }) =>
        passesLeagueVisibility(leagueKind, selectedRosterSet, highlightAvailable, hideUnhighlighted),
      )
    }
    return rows
  }, [
    tableRows,
    hidePickRows,
    positionFilter,
    leagueSnapshot,
    hideUnhighlighted,
    selectedRosterSet,
    highlightAvailable,
  ])


  const tierCell = (val: number | null) =>
    val !== null ? (
      <Badge variant="secondary">T{val}</Badge>
    ) : (
      '-'
    )

  const columns = useMemo((): ColumnDef<TablePlayer>[] => {
    const normCell = (val: number | null) => (val !== null ? val.toLocaleString() : '-')
    const rawCell = (val: number | null) => (
      <span className="text-muted-foreground">{val !== null ? val.toLocaleString() : '-'}</span>
    )

    const deltaPtsCell = (val: number | null) => {
      if (val === null) return '-'
      const text = val > 0 ? `+${val.toLocaleString()}` : val.toLocaleString()
      return (
        <span
          className={cn(
            val > 0 && 'text-emerald-600 dark:text-emerald-500',
            val < 0 && 'text-rose-600 dark:text-rose-400',
          )}
        >
          {text}
        </span>
      )
    }

    const rankCellDynKtc = (p: TablePlayer, rank: number | null, posRank: number | null) => (
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span>{rank !== null ? `#${rank}` : '—'}</span>
        {posRank != null && rank !== null ? (
          <span className="text-muted-foreground text-xs">{formatPosRankLabel(p.position, posRank)}</span>
        ) : null}
      </div>
    )

    const rankCellRdKtc = (p: TablePlayer, rank: number | null, posRank: number | null) => (
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span>{rank !== null ? `#${rank}` : '—'}</span>
        {posRank != null && rank !== null ? (
          <span className="text-muted-foreground text-xs">{formatPosRankLabel(p.position, posRank)}</span>
        ) : null}
      </div>
    )

    const rankCellSimple = (p: TablePlayer, rank: number | null, posRank: number | null) => (
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
                player={p}
                laneLabel="Dyn"
                className="shrink-0"
              />
              <ConsensusFlag
                lane="redraft"
                minAbsDeltaPercentileCutoff={rdConsensusCutoff}
                deltaFc={p.rdDeltaNormFcVsKtc}
                deltaDd={p.rdDeltaNormDdVsKtc}
                player={p}
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
          {
            accessorKey: 'dynKtcValue',
            header: 'KTC raw',
            cell: ({ getValue }) => rawCell(getValue() as number | null),
          },
          {
            accessorKey: 'dynKtcNorm',
            header: 'KTC norm',
            cell: ({ getValue }) => normCell(getValue() as number | null),
          },
          {
            accessorKey: 'dynTierKtc',
            header: 'T KTC',
            cell: ({ getValue }) => tierCell(getValue() as number | null),
          },
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
          {
            accessorKey: 'dynDdValue',
            header: 'DD raw',
            cell: ({ getValue }) => rawCell(getValue() as number | null),
          },
          {
            accessorKey: 'dynDdNorm',
            header: 'DD norm',
            cell: ({ getValue }) => normCell(getValue() as number | null),
          },
          {
            accessorKey: 'dynTierDd',
            header: 'T DD',
            cell: ({ getValue }) => tierCell(getValue() as number | null),
          },
          {
            accessorKey: 'dynDeltaNormDdVsKtc',
            header: 'Δ pts DD',
            cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
          },
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
          {
            accessorKey: 'dynFcValue',
            header: 'FC raw',
            cell: ({ getValue }) => rawCell(getValue() as number | null),
          },
          {
            accessorKey: 'dynFcNorm',
            header: 'FC norm',
            cell: ({ getValue }) => normCell(getValue() as number | null),
          },
          {
            accessorKey: 'dynTierFc',
            header: 'T FC',
            cell: ({ getValue }) => tierCell(getValue() as number | null),
          },
          {
            accessorKey: 'dynDeltaNormFcVsKtc',
            header: 'Δ pts',
            cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
          },
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
              const p = row.original
              const pr = formatPosRankLabel(p.position, p.dynAvgPosRank)
              if (val === null) return '-'
              return (
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="font-semibold">{val.toLocaleString()}</span>
                  {p.dynAvgPosRank != null ? (
                    <span className="text-muted-foreground text-xs">{pr}</span>
                  ) : null}
                </div>
              )
            },
          },
          {
            accessorKey: 'dynTierAvg',
            header: 'Tier Σ',
            cell: ({ getValue }) => tierCell(getValue() as number | null),
          },
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
          {
            accessorKey: 'rdKtcValue',
            header: 'KTC raw',
            cell: ({ getValue }) => rawCell(getValue() as number | null),
          },
          {
            accessorKey: 'rdKtcNorm',
            header: 'KTC norm',
            cell: ({ getValue }) => normCell(getValue() as number | null),
          },
          {
            accessorKey: 'rdTierKtc',
            header: 'T KTC',
            cell: ({ getValue }) => tierCell(getValue() as number | null),
          },
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
          {
            accessorKey: 'rdDdValue',
            header: 'ADP raw',
            cell: ({ getValue }) => rawCell(getValue() as number | null),
          },
          {
            accessorKey: 'rdDdNorm',
            header: 'ADP norm',
            cell: ({ getValue }) => normCell(getValue() as number | null),
          },
          {
            accessorKey: 'rdTierDd',
            header: 'T ADP',
            cell: ({ getValue }) => tierCell(getValue() as number | null),
          },
          {
            accessorKey: 'rdDeltaNormDdVsKtc',
            header: 'Δ pts ADP',
            cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
          },
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
          {
            accessorKey: 'rdFcValue',
            header: 'FC raw',
            cell: ({ getValue }) => rawCell(getValue() as number | null),
          },
          {
            accessorKey: 'rdFcNorm',
            header: 'FC norm',
            cell: ({ getValue }) => normCell(getValue() as number | null),
          },
          {
            accessorKey: 'rdTierFc',
            header: 'T FC',
            cell: ({ getValue }) => tierCell(getValue() as number | null),
          },
          {
            accessorKey: 'rdDeltaNormFcVsKtc',
            header: 'Δ pts',
            cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
          },
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
              const p = row.original
              const pr = formatPosRankLabel(p.position, p.rdAvgPosRank)
              if (val === null) return '-'
              return (
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="font-semibold">{val.toLocaleString()}</span>
                  {p.rdAvgPosRank != null ? (
                    <span className="text-muted-foreground text-xs">{pr}</span>
                  ) : null}
                </div>
              )
            },
          },
          {
            accessorKey: 'rdTierAvg',
            header: 'Tier Σ',
            cell: ({ getValue }) => tierCell(getValue() as number | null),
          },
        ],
      },
    ]

  }, [dynConsensusCutoff, rdConsensusCutoff, search.leagueId])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const rowModelRows = table.getRowModel().rows
  const leafColumnCount = table.getAllLeafColumns().length

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

  const dynastyGroupVisible = ['dynasty_ktc', 'dynasty_dd', 'dynasty_fc', 'dynasty_avg'].some(
    (id) => columnVisibility[id] !== false,
  )
  const redraftGroupVisible = ['redraft_ktc', 'redraft_dd', 'redraft_fc', 'redraft_avg'].some(
    (id) => columnVisibility[id] !== false,
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-4 pt-2 sm:px-4">
      <div className="shrink-0 -mx-3 sm:-mx-4">
        <RankingsToolbar
          leagueSnapshot={leagueSnapshot}
          searchLeagueId={search.leagueId}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          positionFilter={positionFilter}
          onPositionFilterChange={setPositionFilter}
          normMode={normMode}
          onNormModeChange={setNormMode}
          hidePickRows={hidePickRows}
          onHidePickRowsChange={setHidePickRows}
          dynastyGroupVisible={dynastyGroupVisible}
          redraftGroupVisible={redraftGroupVisible}
          onToggleDynastyColumns={toggleDynastyColumns}
          onToggleRedraftColumns={toggleRedraftColumns}
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
