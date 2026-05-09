#!/usr/bin/env python3
"""One-shot polish for app/routes/rankings.tsx (toolbar, consensus, pos ranks, overscan)."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "app" / "routes" / "rankings.tsx"
text = path.read_text()

text = text.replace(
    "import { useEffect, useMemo, useRef, useState } from 'react'",
    "import { useCallback, useEffect, useMemo, useRef, useState } from 'react'",
)
text = text.replace(
    "import { Badge } from '@/components/ui/badge'\nimport { Input } from '@/components/ui/input'\nimport { Button } from '@/components/ui/button'",
    "import { Badge } from '@/components/ui/badge'\nimport { RankingsToolbar } from '@/components/rankings/rankings-toolbar'\nimport { ConsensusFlag } from '@/components/league/consensus-flag'\nimport { computeMinAbsDeltaPercentileCutoff } from '@/lib/rankings/consensus-threshold'\nimport { formatPosRankLabel } from '@/lib/rankings/neighbor-lists'",
)

text = text.replace(
    "const ESTIMATE_ROW_HEIGHT_PX = 36\n",
    "const ESTIMATE_ROW_HEIGHT_PX = 36\nconst ROW_VIRTUAL_OVERSCAN = 32\n",
)

old_settings = """  const rankingsDefaultLeagueId = useUiSettings((s) => s.rankingsDefaultLeagueId)

  const [sorting, setSorting] = useState<SortingState>([{ id: 'dynAvgNorm', desc: true }])"""

new_settings = """  const rankingsDefaultLeagueId = useUiSettings((s) => s.rankingsDefaultLeagueId)
  const rankingsFiltersCollapsed = useUiSettings((s) => s.rankingsFiltersCollapsed)
  const setRankingsFiltersCollapsed = useUiSettings((s) => s.setRankingsFiltersCollapsed)
  const consensusPercentile = useUiSettings((s) => s.consensusPercentile)

  const [sorting, setSorting] = useState<SortingState>([{ id: 'dynAvgNorm', desc: true }])"""

if old_settings not in text:
    raise SystemExit("settings block not found")
text = text.replace(old_settings, new_settings, 1)

old_toggle = """  const toggleHighlightTeam = (rosterId: number) => {
    setHighlightTeamIds((prev) =>
      prev.includes(rosterId) ? prev.filter((x) => x !== rosterId) : [...prev, rosterId],
    )
  }

  const aggregatedData = useMemo("""

new_toggle = """  const toggleHighlightTeam = (rosterId: number) => {
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

  const aggregatedData = useMemo("""

if old_toggle not in text:
    raise SystemExit("toggle block not found")
text = text.replace(old_toggle, new_toggle, 1)

old_agg = """  const aggregatedData = useMemo(
    () => aggregatePlayerValues(players, values, normMode),
    [players, values, normMode],
  )

  const tableRows = useMemo("""

new_agg = """  const aggregatedData = useMemo(
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

  const tableRows = useMemo("""

if old_agg not in text:
    raise SystemExit("aggregated block not found")
text = text.replace(old_agg, new_agg, 1)

old_delta = """    const deltaPtsCell = (val: number | null) => {
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

    return ["""

new_delta = """    const deltaPtsCell = (val: number | null) => {
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
        <ConsensusFlag
          lane="dynasty"
          minAbsDeltaPercentileCutoff={dynConsensusCutoff}
          deltaFc={p.dynDeltaNormFcVsKtc}
          deltaDd={p.dynDeltaNormDdVsKtc}
          player={p}
          laneLabel="Dyn"
          className="shrink-0"
        />
      </div>
    )

    const rankCellRdKtc = (p: TablePlayer, rank: number | null, posRank: number | null) => (
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span>{rank !== null ? `#${rank}` : '—'}</span>
        {posRank != null && rank !== null ? (
          <span className="text-muted-foreground text-xs">{formatPosRankLabel(p.position, posRank)}</span>
        ) : null}
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

    const rankCellSimple = (p: TablePlayer, rank: number | null, posRank: number | null) => (
      <div className="flex items-center gap-1 whitespace-nowrap">
        <span>{rank !== null ? `#${rank}` : '—'}</span>
        {posRank != null && rank !== null ? (
          <span className="text-muted-foreground text-xs">{formatPosRankLabel(p.position, posRank)}</span>
        ) : null}
      </div>
    )

    return ["""

if old_delta not in text:
    raise SystemExit("deltaPtsCell block not found")
text = text.replace(old_delta, new_delta, 1)

replacements = [
    (
        """          {
            accessorKey: 'dynKtcRank',
            header: 'KTC #',
            cell: ({ getValue }) => {
              const v = getValue() as number | null
              return v !== null ? `#${v}` : '-'
            },
          },""",
        """          {
            accessorKey: 'dynKtcRank',
            header: 'KTC #',
            cell: ({ row, getValue }) =>
              rankCellDynKtc(row.original, getValue() as number | null, row.original.dynKtcPosRank),
          },""",
    ),
    (
        """          {
            accessorKey: 'dynDdRank',
            header: 'DD #',
            cell: ({ getValue }) => {
              const v = getValue() as number | null
              return v !== null ? `#${v}` : '-'
            },
          },""",
        """          {
            accessorKey: 'dynDdRank',
            header: 'DD #',
            cell: ({ row, getValue }) =>
              rankCellSimple(row.original, getValue() as number | null, row.original.dynDdPosRank),
          },""",
    ),
    (
        """          {
            accessorKey: 'dynFcRank',
            header: 'FC #',
            cell: ({ getValue }) => {
              const v = getValue() as number | null
              return v !== null ? `#${v}` : '-'
            },
          },""",
        """          {
            accessorKey: 'dynFcRank',
            header: 'FC #',
            cell: ({ row, getValue }) =>
              rankCellSimple(row.original, getValue() as number | null, row.original.dynFcPosRank),
          },""",
    ),
    (
        """          {
            accessorKey: 'dynAvgNorm',
            header: 'Avg',
            cell: ({ getValue }) => {
              const val = getValue() as number | null
              return val !== null ? <span className="font-semibold">{val.toLocaleString()}</span> : '-'
            },
          },""",
        """          {
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
          },""",
    ),
    (
        """          {
            accessorKey: 'rdKtcRank',
            header: 'KTC #',
            cell: ({ getValue }) => {
              const v = getValue() as number | null
              return v !== null ? `#${v}` : '-'
            },
          },""",
        """          {
            accessorKey: 'rdKtcRank',
            header: 'KTC #',
            cell: ({ row, getValue }) =>
              rankCellRdKtc(row.original, getValue() as number | null, row.original.rdKtcPosRank),
          },""",
    ),
    (
        """          {
            accessorKey: 'rdDdRank',
            header: 'ADP #',
            cell: ({ getValue }) => {
              const v = getValue() as number | null
              return v !== null ? `#${v}` : '-'
            },
          },""",
        """          {
            accessorKey: 'rdDdRank',
            header: 'ADP #',
            cell: ({ row, getValue }) =>
              rankCellSimple(row.original, getValue() as number | null, row.original.rdDdPosRank),
          },""",
    ),
    (
        """          {
            accessorKey: 'rdFcRank',
            header: 'FC #',
            cell: ({ getValue }) => {
              const v = getValue() as number | null
              return v !== null ? `#${v}` : '-'
            },
          },""",
        """          {
            accessorKey: 'rdFcRank',
            header: 'FC #',
            cell: ({ row, getValue }) =>
              rankCellSimple(row.original, getValue() as number | null, row.original.rdFcPosRank),
          },""",
    ),
    (
        """          {
            accessorKey: 'rdAvgNorm',
            header: 'Avg',
            cell: ({ getValue }) => {
              const val = getValue() as number | null
              return val !== null ? <span className="font-semibold">{val.toLocaleString()}</span> : '-'
            },
          },""",
        """          {
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
          },""",
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit("column snippet missing:\\n" + old[:120])
    text = text.replace(old, new, 1)

text = text.replace("  }, [])\n\n  const table = useReactTable", "  }, [dynConsensusCutoff, rdConsensusCutoff])\n\n  const table = useReactTable")

text = text.replace("    overscan: 12,", "    overscan: ROW_VIRTUAL_OVERSCAN,")

old_return = """  const positions = ['QB', 'RB', 'WR', 'TE', 'PICK']

  const rosterOptions = leagueSnapshot?.rosters ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-3 py-4 sm:px-4">
      <div className="shrink-0">
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
      </div>

      {aggregatedData.length === 0 ? ("""

new_return = """  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-3 py-4 sm:px-4">
      <div className="shrink-0 space-y-3">
        <div>
          <h1 className="text-3xl font-bold">Rankings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Dynasty and redraft side by side. Norm scale and defaults live in{' '}
            <Link to="/settings" className="text-foreground underline">
              Settings
            </Link>
            .
          </p>
        </div>
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
          rankingsFiltersCollapsed={rankingsFiltersCollapsed}
          onRankingsFiltersCollapsedChange={setRankingsFiltersCollapsed}
        />
      </div>

      {aggregatedData.length === 0 ? ("""

if old_return not in text:
    raise SystemExit("return / filter block not found")
text = text.replace(old_return, new_return, 1)

path.write_text(text)
print("ok", path)
