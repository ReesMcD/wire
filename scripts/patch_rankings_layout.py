#!/usr/bin/env python3
"""Patch app/routes/rankings.tsx: sticky-friendly columns, settings-driven league, merged filters."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "app" / "routes" / "rankings.tsx"
text = path.read_text()

text = text.replace(
    "import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'",
    "import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'",
)
text = text.replace("import { RefreshCw } from 'lucide-react'\n", "")
text = text.replace(
    "import {\n  aggregatePlayerValues,\n  type AggregatedPlayer,\n  type NormMode,\n} from '@/lib/rankings/player-metrics'",
    "import { aggregatePlayerValues, type AggregatedPlayer } from '@/lib/rankings/player-metrics'",
)
text = text.replace(
    "import { getLeagueRosterSnapshot, type LeagueRosterSnapshot } from '@/server/functions/sync-sleeper'\n\nconst NORM_MODE_STORAGE_KEY = 'rankings-norm-mode'\n",
    "import { getLeagueRosterSnapshot, type LeagueRosterSnapshot } from '@/server/functions/sync-sleeper'\nimport { useUiSettings } from '@/lib/stores/ui-settings'\n\n",
)

old_state = """function RankingsPage() {
  const navigate = useNavigate({ from: '/rankings' })
  const router = useRouter()
  const search = Route.useSearch()
  const { players, values, leagueSnapshot } = Route.useLoaderData()
  const hydratedUrl = useRef(false)
  const spreadsheetScrollRef = useRef<HTMLDivElement>(null)

  const [sorting, setSorting] = useState<SortingState>([{ id: 'dynAvgNorm', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState<string | null>(null)
  const [normMode, setNormMode] = useState<NormMode>('quantile')

  const [leagueInput, setLeagueInput] = useState('')
  /** Rosters selected for highlight (multi-select). */
  const [highlightTeamIds, setHighlightTeamIds] = useState<number[]>([])
  const [highlightAvailable, setHighlightAvailable] = useState(false)
  const [hideUnhighlighted, setHideUnhighlighted] = useState(false)
  const [hidePicks, setHidePicks] = useState(false)
  const [leagueBusy, setLeagueBusy] = useState(false)

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})"""

new_state = """function RankingsPage() {
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

  const [sorting, setSorting] = useState<SortingState>([{ id: 'dynAvgNorm', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState<string | null>(null)
  /** Rosters selected for highlight (multi-select). */
  const [highlightTeamIds, setHighlightTeamIds] = useState<number[]>([])
  const [highlightAvailable, setHighlightAvailable] = useState(false)

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})"""

if old_state not in text:
    raise SystemExit("state block not found")
text = text.replace(old_state, new_state, 1)

text = re.sub(
    r"\n  useEffect\(\(\) => \{\n    try \{\n      const s = localStorage\.getItem\(NORM_MODE_STORAGE_KEY\).*?\n  \}, \[normMode\]\)\n",
    "\n",
    text,
    count=1,
    flags=re.DOTALL,
)

text = text.replace(
    """  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY)
      if (!raw) return
      const j = JSON.parse(raw) as Record<string, unknown>
      const next: VisibilityState = {}
      if (typeof j.dynasty === 'boolean') next.dynasty = j.dynasty
      if (typeof j.redraft === 'boolean') next.redraft = j.redraft
      setColumnVisibility(next)
    } catch {
      /* ignore */
    }
  }, [])""",
    """  useEffect(() => {
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
  }, [])""",
)

text = text.replace(
    """  useEffect(() => {
    try {
      localStorage.setItem(
        COLUMN_VISIBILITY_STORAGE_KEY,
        JSON.stringify({
          dynasty: columnVisibility.dynasty !== false,
          redraft: columnVisibility.redraft !== false,
        }),
      )
    } catch {
      /* ignore */
    }
  }, [columnVisibility])""",
    """  useEffect(() => {
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
  }, [columnVisibility])""",
)

text = text.replace(
    """  useEffect(() => {
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
  }, [navigate, search.leagueId])""",
    """  useEffect(() => {
    if (typeof window === 'undefined' || search.leagueId) return
    let id = ''
    try {
      id = localStorage.getItem(LEAGUE_ID_STORAGE_KEY)?.trim() ?? ''
    } catch {
      /* ignore */
    }
    if (!id) id = rankingsDefaultLeagueId.trim()
    if (id) navigate({ search: { leagueId: id }, replace: true })
  }, [navigate, rankingsDefaultLeagueId, search.leagueId])""",
)

text = text.replace("if (hidePicks) rows", "if (hidePickRows) rows")
text = text.replace(
    """  }, [
    tableRows,
    hidePicks,""",
    """  }, [
    tableRows,
    hidePickRows,""",
)

text = re.sub(
    r"\n  const onLoadLeague = \(\) => \{.*?\n  const lastFetchedLabel = useMemo\(\(\) => \{.*?\n  \}, \[leagueSnapshot\?\.fetchedAt\]\)\n\n  const tierCell",
    "\n\n  const tierCell",
    text,
    count=1,
    flags=re.DOTALL,
)

NEW_COLUMNS = r"""    return [
      {
        accessorKey: 'name',
        header: 'Player',
        cell: ({ row }) => (
          <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
            <span className="font-medium">{row.original.name}</span>
            {row.original.position && (
              <Badge variant="outline" className="text-xs">
                {row.original.position}
              </Badge>
            )}
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
        ],
      },
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
        ],
      },
    ]
"""

m = re.search(
    r"    const deltaTierDiffCell = \(val: number \| null\) => \{.*?\n    return \[",
    text,
    flags=re.DOTALL,
)
if not m:
    raise SystemExit("column block start not found")
start = m.start()
end = text.index("\n  }, [])\n\n  const table = useReactTable", start)
text = text[:start] + NEW_COLUMNS + text[end:]

text = text.replace(
    "  const dynastyGroupVisible = columnVisibility.dynasty !== false\n  const redraftGroupVisible = columnVisibility.redraft !== false",
    """  const dynastyGroupVisible = ['dynasty_ktc', 'dynasty_dd', 'dynasty_fc', 'dynasty_avg'].some(
    (id) => columnVisibility[id] !== false,
  )
  const redraftGroupVisible = ['redraft_ktc', 'redraft_dd', 'redraft_fc', 'redraft_avg'].some(
    (id) => columnVisibility[id] !== false,
  )""",
)

OLD_JSX = """      <div className="shrink-0">
        <h1 className="mb-2 text-3xl font-bold">Rankings</h1>
        <p className="text-muted-foreground">
          Dynasty and redraft values side by side (FantasyCalc, KTC, Dynasty Daddy / ADP Daddy). Normalized
          to 9999 max per source (Max), or FC quantile-matched to KTC then scaled (Quantile); DD/ADP use the
          same max scale for Quantile. Legacy rows stored as{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">fantasycalc</code> /{' '}
          <code className="text-xs">ktc</code> count as dynasty. Headers group each format into KTC, Dynasty
          Daddy (or ADP Daddy in redraft), FantasyCalc (FC + Δ vs KTC), and Avg (tier Σ + ΔT Σ vs KTC). Δ pts
          = source norm − KTC norm where shown. ΔT = tier − KTC tier (lower tier # is better). Tier columns
          use max-scale stamping; toggle affects norms and Δ pts only. Load a Sleeper league, then toggle any
          combination of teams and Available to highlight; use Hide unhighlighted to drop other players. Hide
          picks removes draft-pick rows from the table.
        </p>
      </div>

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
              <Button
                type="button"
                size="sm"
                className="min-h-9"
                variant={hideUnhighlighted ? 'default' : 'outline'}
                onClick={() => setHideUnhighlighted((v) => !v)}
              >
                Hide unhighlighted
              </Button>
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
          <Button
            type="button"
            variant={normMode === 'max' ? 'default' : 'outline'}
            size="sm"
            className="min-h-10 sm:min-h-9"
            onClick={() => setNormMode('max')}
          >
            Max
          </Button>
          <Button
            type="button"
            variant={normMode === 'quantile' ? 'default' : 'outline'}
            size="sm"
            className="min-h-10 sm:min-h-9"
            onClick={() => setNormMode('quantile')}
          >
            Quantile
          </Button>
        </div>
        <Button
          type="button"
          variant={hidePicks ? 'default' : 'outline'}
          size="sm"
          className="min-h-10 sm:min-h-9"
          onClick={() => setHidePicks((v) => !v)}
        >
          Hide picks
        </Button>
        <div className="flex flex-wrap items-center gap-2 border-l border-border pl-3">
          <span className="text-muted-foreground text-sm">Columns:</span>
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
        </div>
      </div>"""

NEW_JSX = """      <div className="shrink-0">
        <h1 className="mb-2 text-3xl font-bold">Rankings</h1>
        <p className="text-muted-foreground">
          Dynasty and redraft values side by side (FantasyCalc, KTC, Dynasty Daddy / ADP Daddy). Normalized
          to 9999 max per source (Max), or FC quantile-matched to KTC then scaled (Quantile); DD/ADP use the
          same max scale for Quantile. Legacy rows stored as{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">fantasycalc</code> /{' '}
          <code className="text-xs">ktc</code> count as dynasty. Headers group each source into KTC, Dynasty
          Daddy (or ADP Daddy in redraft), FantasyCalc (FC + Δ vs KTC), and Avg (tier Σ). Δ pts = source norm −
          KTC norm where shown. Tier columns use max-scale stamping. Save your Sleeper league ID and refresh
          rosters in{' '}
          <Link to="/settings" className="text-foreground underline">
            Settings
          </Link>
          ; then use Available / team toggles in the filter bar to highlight. Hide unhighlighted filters the
          table. Hide picks removes draft-pick rows.
        </p>
      </div>

      <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <span>
            Norm: <span className="text-foreground font-medium">{normMode}</span>
          </span>
          <Link to="/settings" className="text-foreground underline">
            Settings
          </Link>
          {leagueSnapshot ? (
            <span>
              League:{' '}
              <span className="text-foreground font-medium">{leagueSnapshot.league.name}</span>
              <span className="text-muted-foreground"> · {leagueSnapshot.league.season}</span>
            </span>
          ) : search.leagueId ? (
            <span className="text-amber-600 dark:text-amber-500">
              League id in URL but snapshot missing — check Settings or use Refresh in the header.
            </span>
          ) : (
            <span>No league loaded — add a default league in Settings.</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
          <div className="flex flex-wrap items-center gap-2 border-l border-border pl-3">
            <span className="text-muted-foreground text-sm">Scale:</span>
            <Button
              type="button"
              variant={normMode === 'max' ? 'default' : 'outline'}
              size="sm"
              className="min-h-10 sm:min-h-9"
              onClick={() => setNormMode('max')}
            >
              Max
            </Button>
            <Button
              type="button"
              variant={normMode === 'quantile' ? 'default' : 'outline'}
              size="sm"
              className="min-h-10 sm:min-h-9"
              onClick={() => setNormMode('quantile')}
            >
              Quantile
            </Button>
          </div>
          <Button
            type="button"
            variant={hidePickRows ? 'default' : 'outline'}
            size="sm"
            className="min-h-10 sm:min-h-9"
            onClick={() => setHidePickRows(!hidePickRows)}
          >
            Hide picks
          </Button>
          <div className="flex flex-wrap items-center gap-2 border-l border-border pl-3">
            <span className="text-muted-foreground text-sm">Columns:</span>
            <Button
              type="button"
              variant={dynastyGroupVisible ? 'default' : 'outline'}
              size="sm"
              className="min-h-10 sm:min-h-9"
              onClick={() => {
                const ids = ['dynasty_ktc', 'dynasty_dd', 'dynasty_fc', 'dynasty_avg'] as const
                const anyOn = ids.some((id) => columnVisibility[id] !== false)
                const next = !anyOn
                setColumnVisibility((v) => {
                  const u = { ...v }
                  for (const id of ids) u[id] = next
                  return u
                })
              }}
            >
              Dynasty
            </Button>
            <Button
              type="button"
              variant={redraftGroupVisible ? 'default' : 'outline'}
              size="sm"
              className="min-h-10 sm:min-h-9"
              onClick={() => {
                const ids = ['redraft_ktc', 'redraft_dd', 'redraft_fc', 'redraft_avg'] as const
                const anyOn = ids.some((id) => columnVisibility[id] !== false)
                const next = !anyOn
                setColumnVisibility((v) => {
                  const u = { ...v }
                  for (const id of ids) u[id] = next
                  return u
                })
              }}
            >
              Redraft
            </Button>
          </div>

          {leagueSnapshot ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-l border-border pl-3">
                <span className="text-muted-foreground text-sm">Highlight:</span>
                <div className="flex max-w-full flex-1 flex-nowrap gap-1.5 overflow-x-auto py-0.5 sm:min-w-0 sm:max-w-[min(100%,52rem)]">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-9 shrink-0"
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
                      className="min-h-9 shrink-0"
                      variant={highlightTeamIds.includes(r.rosterId) ? 'default' : 'outline'}
                      title={`${rosterDisplayName(r, leagueSnapshot.users)} (${r.rosterId})`}
                      onClick={() => toggleHighlightTeam(r.rosterId)}
                    >
                      {rosterDisplayName(r, leagueSnapshot.users)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-l border-border pl-3">
                <Button
                  type="button"
                  size="sm"
                  className="min-h-9"
                  variant={hideUnhighlighted ? 'default' : 'outline'}
                  onClick={() => setHideUnhighlighted(!hideUnhighlighted)}
                >
                  Hide unhighlighted
                </Button>
                <span className="text-muted-foreground max-w-md text-xs">
                  On: only rows matching highlight toggles stay.
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>"""

if OLD_JSX not in text:
    raise SystemExit("OLD_JSX not found")
text = text.replace(OLD_JSX, NEW_JSX, 1)

text = text.replace(
    """        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border">""",
    """        <div className="flex min-h-0 flex-1 flex-col border border-border">""",
)

text = text.replace(
    """                        <TableHead
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
                        >""",
    """                        <TableHead
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
                        >""",
)

text = text.replace(
    """                        <TableCell
                          key={cell.id}
                          className={cn(
                            cell.column.id === 'name' && 'spreadsheet-sticky-name font-medium',
                            lv?.kind === 'paint' && lv.cellBg,
                            lv?.kind === 'paint' && cell.column.id === 'name' && lv.nameBorder,
                            lv?.kind === 'dim' && 'opacity-[0.38]',
                          )}
                        >""",
    """                        <TableCell
                          key={cell.id}
                          className={cn(
                            'whitespace-nowrap',
                            cell.column.id === 'name' && 'spreadsheet-sticky-name font-medium',
                            lv?.kind === 'paint' && lv.cellBg,
                            lv?.kind === 'paint' && cell.column.id === 'name' && lv.nameBorder,
                            lv?.kind === 'dim' && 'opacity-[0.38]',
                          )}
                        >""",
)

path.write_text(text)
print("ok", path)
