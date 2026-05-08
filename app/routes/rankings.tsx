import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { RefreshCw } from 'lucide-react'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ConsensusFlag } from '@/components/league/consensus-flag'
import { ConsensusIndicatorSettings } from '@/components/league/consensus-indicator-settings'
import { computeMinAbsDeltaPercentileCutoff } from '@/lib/rankings/consensus-threshold'
import { readPlayers, readValues } from '@/server/functions/read-data'
import type { LeagueUser, Roster } from '@/lib/db/schema'
import {
  aggregatePlayerValues,
  type AggregatedPlayer,
} from '@/lib/rankings/player-metrics'
import { useUiSettings } from '@/lib/stores/ui-settings'
import {
  explainDelta,
  explainHidePicks,
  explainHideUnhighlighted,
  explainNormMode,
} from '@/lib/rankings/explain'
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

const ESTIMATE_ROW_HEIGHT_PX = 36

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
  const router = useRouter()
  const search = Route.useSearch()
  const { players, values, leagueSnapshot } = Route.useLoaderData()
  const hydratedUrl = useRef(false)
  const spreadsheetScrollRef = useRef<HTMLDivElement>(null)

  const [sorting, setSorting] = useState<SortingState>([{ id: 'dynAvgNorm', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState<string | null>(null)

  const normMode = useUiSettings((s) => s.normMode)
  const setNormMode = useUiSettings((s) => s.setNormMode)
  const hidePicks = useUiSettings((s) => s.rankingsHidePicks)
  const setHidePicks = useUiSettings((s) => s.setRankingsHidePicks)
  const hideUnhighlighted = useUiSettings((s) => s.rankingsHideUnhighlighted)
  const setHideUnhighlighted = useUiSettings((s) => s.setRankingsHideUnhighlighted)
  const storedColumnVisibility = useUiSettings((s) => s.rankingsColumnVisibility)
  const setStoredColumnVisibility = useUiSettings((s) => s.setRankingsColumnVisibility)

  const columnVisibility = useMemo<VisibilityState>(
    () => ({ dynasty: storedColumnVisibility.dynasty, redraft: storedColumnVisibility.redraft }),
    [storedColumnVisibility],
  )
  const setColumnVisibility = (
    updater: VisibilityState | ((old: VisibilityState) => VisibilityState),
  ) => {
    setStoredColumnVisibility((prev) => {
      const old: VisibilityState = { dynasty: prev.dynasty, redraft: prev.redraft }
      const next = typeof updater === 'function' ? updater(old) : updater
      return {
        dynasty: next.dynasty !== false,
        redraft: next.redraft !== false,
      }
    })
  }

  const [leagueInput, setLeagueInput] = useState('')
  /** Rosters selected for highlight (multi-select). */
  const [highlightTeamIds, setHighlightTeamIds] = useState<number[]>([])
  const [highlightAvailable, setHighlightAvailable] = useState(false)
  const [leagueBusy, setLeagueBusy] = useState(false)

  useEffect(() => {
    try {
      const id = localStorage.getItem(LEAGUE_ID_STORAGE_KEY)?.trim()
      if (id) setLeagueInput(id)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (search.leagueId) {
      hydratedUrl.current = true
      return
    }
    if (hydratedUrl.current) return
    try {
      const id = localStorage.getItem(LEAGUE_ID_STORAGE_KEY)?.trim()
      if (id) {
        hydratedUrl.current = true
        navigate({ search: { leagueId: id }, replace: true })
        return
      }
    } catch {
      /* ignore */
    }
    hydratedUrl.current = true
  }, [navigate, search.leagueId])

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

  const aggregatedData = useMemo(
    () => aggregatePlayerValues(players, values, normMode),
    [players, values, normMode],
  )

  const consensusPercentileSetting = useUiSettings((s) => s.consensusPercentile)
  const consensusCutoffDyn = useMemo(
    () => computeMinAbsDeltaPercentileCutoff(aggregatedData, 'dynasty', consensusPercentileSetting),
    [aggregatedData, consensusPercentileSetting],
  )
  const consensusCutoffRd = useMemo(
    () => computeMinAbsDeltaPercentileCutoff(aggregatedData, 'redraft', consensusPercentileSetting),
    [aggregatedData, consensusPercentileSetting],
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
    if (hidePicks) rows = rows.filter((p) => p.position !== 'PICK')
    if (positionFilter) rows = rows.filter((p) => p.position === positionFilter)
    if (leagueSnapshot && hideUnhighlighted) {
      rows = rows.filter(({ leagueKind }) =>
        passesLeagueVisibility(leagueKind, selectedRosterSet, highlightAvailable, hideUnhighlighted),
      )
    }
    return rows
  }, [
    tableRows,
    hidePicks,
    positionFilter,
    leagueSnapshot,
    hideUnhighlighted,
    selectedRosterSet,
    highlightAvailable,
  ])

  const onLoadLeague = () => {
    const id = leagueInput.trim()
    if (!id) return
    try {
      localStorage.setItem(LEAGUE_ID_STORAGE_KEY, id)
      notifyLeagueStorageChanged()
    } catch {
      /* ignore */
    }
    navigate({ search: { leagueId: id } })
  }

  const onClearLeague = () => {
    try {
      localStorage.removeItem(LEAGUE_ID_STORAGE_KEY)
      localStorage.removeItem(LEAGUE_FETCHED_AT_STORAGE_KEY)
      notifyLeagueStorageChanged()
    } catch {
      /* ignore */
    }
    setLeagueInput('')
    navigate({ search: { leagueId: undefined } })
  }

  const onRefreshLeague = async () => {
    const id = search.leagueId ?? leagueInput.trim()
    if (!id || leagueBusy) return
    setLeagueBusy(true)
    try {
      await getLeagueRosterSnapshot({ data: { leagueId: id } })
      try {
        localStorage.setItem(LEAGUE_FETCHED_AT_STORAGE_KEY, new Date().toISOString())
      } catch {
        /* ignore */
      }
      await router.invalidate()
    } finally {
      setLeagueBusy(false)
    }
  }

  const lastFetchedLabel = useMemo(() => {
    if (!leagueSnapshot?.fetchedAt) return null
    try {
      return new Date(leagueSnapshot.fetchedAt).toLocaleString()
    } catch {
      return leagueSnapshot.fetchedAt
    }
  }, [leagueSnapshot?.fetchedAt])

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

    const deltaHeader = (label: string, kind: 'fc' | 'dd' | 'avg') => () => (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted">{label}</span>
        </TooltipTrigger>
        <TooltipContent>{explainDelta(kind)}</TooltipContent>
      </Tooltip>
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

    const deltaTierDiffCell = (val: number | null) => {
      if (val === null) return '-'
      const text = val > 0 ? `+${val}` : `${val}`
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

    return [
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
              lane="dynasty"
              laneLabel="Dyn"
              player={row.original}
              minAbsDeltaPercentileCutoff={consensusCutoffDyn}
              deltaFc={row.original.dynDeltaNormFcVsKtc}
              deltaDd={row.original.dynDeltaNormDdVsKtc}
            />
            <ConsensusFlag
              lane="redraft"
              laneLabel="Rd"
              player={row.original}
              minAbsDeltaPercentileCutoff={consensusCutoffRd}
              deltaFc={row.original.rdDeltaNormFcVsKtc}
              deltaDd={row.original.rdDeltaNormDdVsKtc}
            />
          </div>
        ),
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
        id: 'dynasty',
        header: 'Dynasty',
        columns: [
          {
            id: 'dynasty_ktc',
            header: 'KTC Dynasty',
            columns: [
              {
                accessorKey: 'dynKtcRank',
                header: 'KTC #',
                cell: ({ getValue }) => {
                  const v = getValue() as number | null
                  return v !== null ? `#${v}` : '-'
                },
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
                cell: ({ getValue }) => {
                  const v = getValue() as number | null
                  return v !== null ? `#${v}` : '-'
                },
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
                header: deltaHeader('Δ pts DD', 'dd'),
                cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
              },
              {
                accessorKey: 'dynDeltaTierDdVsKtc',
                header: 'ΔT DD',
                cell: ({ getValue }) => deltaTierDiffCell(getValue() as number | null),
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
                cell: ({ getValue }) => {
                  const v = getValue() as number | null
                  return v !== null ? `#${v}` : '-'
                },
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
                header: deltaHeader('Δ pts', 'fc'),
                cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
              },
              {
                accessorKey: 'dynDeltaTierFcVsKtc',
                header: 'ΔT FC',
                cell: ({ getValue }) => deltaTierDiffCell(getValue() as number | null),
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
                cell: ({ getValue }) => {
                  const val = getValue() as number | null
                  return val !== null ? <span className="font-semibold">{val.toLocaleString()}</span> : '-'
                },
              },
              {
                accessorKey: 'dynTierAvg',
                header: 'Tier Σ',
                cell: ({ getValue }) => tierCell(getValue() as number | null),
              },
              {
                accessorKey: 'dynDeltaTierAvgVsKtc',
                header: 'ΔT Σ',
                cell: ({ getValue }) => deltaTierDiffCell(getValue() as number | null),
              },
            ],
          },
        ],
      },
      {
        id: 'redraft',
        header: 'Redraft',
        columns: [
          {
            id: 'redraft_ktc',
            header: 'KTC Redraft',
            columns: [
              {
                accessorKey: 'rdKtcRank',
                header: 'KTC #',
                cell: ({ getValue }) => {
                  const v = getValue() as number | null
                  return v !== null ? `#${v}` : '-'
                },
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
                cell: ({ getValue }) => {
                  const v = getValue() as number | null
                  return v !== null ? `#${v}` : '-'
                },
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
                header: deltaHeader('Δ pts ADP', 'dd'),
                cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
              },
              {
                accessorKey: 'rdDeltaTierDdVsKtc',
                header: 'ΔT ADP',
                cell: ({ getValue }) => deltaTierDiffCell(getValue() as number | null),
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
                cell: ({ getValue }) => {
                  const v = getValue() as number | null
                  return v !== null ? `#${v}` : '-'
                },
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
                header: deltaHeader('Δ pts', 'fc'),
                cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
              },
              {
                accessorKey: 'rdDeltaTierFcVsKtc',
                header: 'ΔT FC',
                cell: ({ getValue }) => deltaTierDiffCell(getValue() as number | null),
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
                cell: ({ getValue }) => {
                  const val = getValue() as number | null
                  return val !== null ? <span className="font-semibold">{val.toLocaleString()}</span> : '-'
                },
              },
              {
                accessorKey: 'rdTierAvg',
                header: 'Tier Σ',
                cell: ({ getValue }) => tierCell(getValue() as number | null),
              },
              {
                accessorKey: 'rdDeltaTierAvgVsKtc',
                header: 'ΔT Σ',
                cell: ({ getValue }) => deltaTierDiffCell(getValue() as number | null),
              },
            ],
          },
        ],
      },
    ]
  }, [consensusCutoffDyn, consensusCutoffRd])

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
    overscan: 12,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const padTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const padBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0

  const dynastyGroupVisible = columnVisibility.dynasty !== false
  const redraftGroupVisible = columnVisibility.redraft !== false

  const positions = ['QB', 'RB', 'WR', 'TE', 'PICK']

  const rosterOptions = leagueSnapshot?.rosters ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-3 py-4 sm:px-4">
      <div className="shrink-0">
        <h1 className="mb-2 text-3xl font-bold">Rankings</h1>
        <p className="text-muted-foreground">
          Dynasty and redraft values side by side (FantasyCalc, KTC, Dynasty Daddy / ADP Daddy). Normalized
          to 9999 max per source (Max), or FC and DD quantile-matched to KTC then scaled (Quantile). Legacy
          rows stored as{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">fantasycalc</code> /{' '}
          <code className="text-xs">ktc</code> count as dynasty. Headers group each format into KTC, Dynasty
          Daddy (or ADP Daddy in redraft), FantasyCalc (FC + Δ vs KTC), and Avg (tier Σ + ΔT Σ vs KTC). Δ pts
          = source norm − KTC norm where shown. ΔT = tier − KTC tier (lower tier # is better). Tier columns
          use max-scale stamping; toggle affects norms and Δ pts only. In Quantile mode FC and DD norms are
          quantile-aligned to KTC so cross-source Δ pts are comparable. Load a Sleeper league, then toggle any
          combination of teams and Available to highlight; use Hide unhighlighted to drop other players. Hide
          picks removes draft-pick rows from the table.
        </p>
      </div>

      <ConsensusIndicatorSettings className="shrink-0 rounded-lg border border-border bg-muted/20 p-3" />

      <div className="flex shrink-0 flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-muted-foreground text-xs font-medium">Sleeper league ID</span>
            <Input
              placeholder="e.g. from league URL…"
              value={leagueInput}
              onChange={(e) => setLeagueInput(e.target.value)}
              className="min-h-10 font-mono text-sm"
            />
          </div>
          <Button type="button" className="min-h-10" onClick={onLoadLeague}>
            Load league
          </Button>
          <Button type="button" variant="outline" className="min-h-10" onClick={onClearLeague}>
            Clear
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            disabled={!search.leagueId || leagueBusy}
            onClick={() => void onRefreshLeague()}
          >
            <RefreshCw className={cn('mr-2 size-4', leagueBusy && 'animate-spin')} />
            Refresh rosters
          </Button>
        </div>
        {leagueSnapshot && (
          <>
            <p className="text-muted-foreground text-sm">
              <span className="font-medium text-foreground">{leagueSnapshot.league.name}</span> ·{' '}
              {leagueSnapshot.league.season} · Last fetched {lastFetchedLabel ?? '—'}
            </p>
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">Highlight</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="min-h-9"
                  variant={highlightAvailable ? 'default' : 'outline'}
                  onClick={() => setHighlightAvailable((v) => !v)}
                >
                  Available
                </Button>
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
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-9"
                    variant={hideUnhighlighted ? 'default' : 'outline'}
                    onClick={() => setHideUnhighlighted(!hideUnhighlighted)}
                  >
                    Hide unhighlighted
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{explainHideUnhighlighted(hideUnhighlighted)}</TooltipContent>
              </Tooltip>
              <span className="text-muted-foreground text-xs">
                On: only rows matching your toggles stay (unless Hide picks is on).
              </span>
            </div>
          </>
        )}
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Scale:</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={normMode === 'max' ? 'default' : 'outline'}
                size="sm"
                className="min-h-10 sm:min-h-9"
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
                type="button"
                variant={normMode === 'quantile' ? 'default' : 'outline'}
                size="sm"
                className="min-h-10 sm:min-h-9"
                onClick={() => setNormMode('quantile')}
              >
                Quantile
              </Button>
            </TooltipTrigger>
            <TooltipContent>{explainNormMode('quantile')}</TooltipContent>
          </Tooltip>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={hidePicks ? 'default' : 'outline'}
              size="sm"
              className="min-h-10 sm:min-h-9"
              onClick={() => setHidePicks(!hidePicks)}
            >
              Hide picks
            </Button>
          </TooltipTrigger>
          <TooltipContent>{explainHidePicks(hidePicks)}</TooltipContent>
        </Tooltip>
        <div className="flex flex-wrap items-center gap-2 border-l border-border pl-3">
          <span className="text-muted-foreground text-sm">Columns:</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={dynastyGroupVisible ? 'default' : 'outline'}
                size="sm"
                className="min-h-10 sm:min-h-9"
                onClick={() =>
                  setColumnVisibility((v) => ({ ...v, dynasty: v.dynasty === false ? true : false }))
                }
              >
                Dynasty
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Show or hide all Dynasty columns (KTC + DD + FC + Avg). Toggle off to focus on Redraft.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={redraftGroupVisible ? 'default' : 'outline'}
                size="sm"
                className="min-h-10 sm:min-h-9"
                onClick={() =>
                  setColumnVisibility((v) => ({ ...v, redraft: v.redraft === false ? true : false }))
                }
              >
                Redraft
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Show or hide all Redraft columns (KTC + ADP + FC + Avg). Toggle off to focus on Dynasty.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {aggregatedData.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          No player values synced yet. Run <code className="rounded bg-muted px-1 py-0.5 text-xs">pnpm sync</code> or use the Sync page.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border">
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
                            'cursor-pointer select-none align-bottom font-medium text-muted-foreground',
                            headerRowIndex === 0 && 'top-0 z-50',
                            headerRowIndex === 1 && 'top-10 z-[48]',
                            headerRowIndex >= 2 && 'top-20 z-40',
                            'sticky h-10 px-2 py-1.5',
                            header.column.id === 'name' && 'spreadsheet-sticky-name z-[60] text-foreground',
                          )}
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
