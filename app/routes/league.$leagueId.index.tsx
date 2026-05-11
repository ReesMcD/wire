import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { Settings, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageSubheader } from '@/components/ui/page-subheader'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LeagueUser, Roster } from '@/lib/db/schema'
import { aggregatePlayerValues, type AggregatedPlayer } from '@/lib/rankings/player-metrics'
import {
  avgLane,
  ddLane,
  DEFAULT_DEPTH_WEIGHTS,
  defaultPowerInput,
  fcLane,
  ktcLane,
  type DepthTier,
  type MetricLane,
  weightedDepthPowerInput,
} from '@/lib/rankings/league-board-power-input'
import { depthTierByPlayerId, selectValueStarters } from '@/lib/rankings/league-board-depth'
import {
  competitionRanksHighIsBest,
  normalizeLeagueMetricTo9999,
  tieAwarePercentiles,
} from '@/lib/rankings/league-board-scoring'
import { cn } from '@/lib/utils'
import { useLeagueRoute } from '@/lib/league-route-context'
import { useUiSettings, type ScoreDisplay } from '@/lib/stores/ui-settings'
import { ConsensusFlag } from '@/components/league/consensus-flag'
import { ConsensusIndicatorSettings } from '@/components/league/consensus-indicator-settings'
import { computeMinAbsDeltaPercentileCutoff } from '@/lib/rankings/consensus-threshold'
import {
  explainBadge,
  explainDepthWeights,
  explainHidePicks,
  explainHideUnhighlighted,
  explainLane,
  explainNormMode,
  explainPortfolioShare,
  explainPositionBadge,
  explainPowerMode,
  explainScoreDisplay,
  explainTierToggle,
  laneLabel,
  poolLabel,
} from '@/lib/rankings/explain'

function formatPickSlotId(slotId: string): string {
  return slotId.replace(/^pick:/, '').replace(/:/g, ' ').toUpperCase()
}

function rosterDisplayName(roster: Roster, users: LeagueUser[]) {
  const u = users.find((x) => x.userId === roster.ownerId)
  return u?.teamName ?? u?.displayName ?? `Roster ${roster.rosterId}`
}

function rosterPlayerMetrics(
  playerIds: string[],
  byId: Map<string, AggregatedPlayer>,
): AggregatedPlayer[] {
  const out: AggregatedPlayer[] = []
  for (const id of playerIds) {
    if (id.startsWith('pick:')) continue
    const m = byId.get(id)
    if (m) out.push(m)
  }
  return out
}

function posSumLane(
  metrics: AggregatedPlayer[],
  lane: MetricLane,
  pos: string,
  laneFn: (p: AggregatedPlayer, lane: MetricLane) => number | null,
): number {
  let s = 0
  for (const p of metrics) {
    if (p.position !== pos) continue
    const v = laneFn(p, lane)
    if (v != null) s += v
  }
  return s
}

function clampWeight(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

export const Route = createFileRoute('/league/$leagueId/')({
  component: LeagueOverviewPage,
})

function LeagueOverviewPage() {
  const { leagueId, players, values, leagueSnapshot } = useLeagueRoute()

  const metricLane = useUiSettings((s) => s.metricLane)
  const setMetricLane = useUiSettings((s) => s.setMetricLane)
  const normMode = useUiSettings((s) => s.normMode)
  const setNormMode = useUiSettings((s) => s.setNormMode)
  const tierIncludes = useUiSettings((s) => s.tierIncludes)
  const setTierIncludes = useUiSettings((s) => s.setTierIncludes)
  const powerMode = useUiSettings((s) => s.powerMode)
  const setPowerMode = useUiSettings((s) => s.setPowerMode)
  const depthWeights = useUiSettings((s) => s.depthWeights)
  const setDepthWeights = useUiSettings((s) => s.setDepthWeights)
  const scoreDisplay = useUiSettings((s) => s.scoreDisplay)
  const setScoreDisplay = useUiSettings((s) => s.setScoreDisplay)
  const showPortfolioShare = useUiSettings((s) => s.showPortfolioShare)
  const setShowPortfolioShare = useUiSettings((s) => s.setShowPortfolioShare)
  const overviewTab = useUiSettings((s) => s.leagueOverviewTab)
  const setOverviewTab = useUiSettings((s) => s.setLeagueOverviewTab)
  const leagueFiltersCollapsed = useUiSettings((s) => s.leagueFiltersCollapsed)
  const setLeagueFiltersCollapsed = useUiSettings((s) => s.setLeagueFiltersCollapsed)

  const aggregated = useMemo(
    () => aggregatePlayerValues(players, values, normMode),
    [players, values, normMode],
  )

  const bySleeperId = useMemo(() => new Map(aggregated.map((p) => [p.sleeperId, p])), [aggregated])

  const consensusPercentileSetting = useUiSettings((s) => s.consensusPercentile)
  const consensusCutoffLane = useMemo(
    () => computeMinAbsDeltaPercentileCutoff(aggregated, metricLane, consensusPercentileSetting),
    [aggregated, metricLane, consensusPercentileSetting],
  )

  const tierAllowed = (tier: DepthTier) =>
    (tier === 'starter' && tierIncludes.starter) ||
    (tier === 'backup' && tierIncludes.backup) ||
    (tier === 'bench' && tierIncludes.bench)

  const teamRows = useMemo(() => {
    const perTeam = leagueSnapshot.rosters.map((roster) => {
      const fullMetrics = rosterPlayerMetrics(roster.playerIds, bySleeperId)
      const depthMap = depthTierByPlayerId(fullMetrics, metricLane)
      const starters = selectValueStarters(fullMetrics, metricLane)
      const starterIds = new Set(starters.map((s) => s.sleeperId))

      const pool = fullMetrics.filter((p) => tierAllowed(depthMap.get(p.sleeperId) ?? 'bench'))

      const rawPower =
        powerMode === 'depthWeighted'
          ? weightedDepthPowerInput(pool, metricLane, depthMap, depthWeights)
          : defaultPowerInput(pool, metricLane)

      const rawKtc = pool.reduce((s, p) => s + (ktcLane(p, metricLane) ?? 0), 0)
      const rawFc = pool.reduce((s, p) => s + (fcLane(p, metricLane) ?? 0), 0)
      const rawDd = pool.reduce((s, p) => s + (ddLane(p, metricLane) ?? 0), 0)
      const rawQb = posSumLane(pool, metricLane, 'QB', avgLane)
      const rawRb = posSumLane(pool, metricLane, 'RB', avgLane)
      const rawWr = posSumLane(pool, metricLane, 'WR', avgLane)
      const rawTe = posSumLane(pool, metricLane, 'TE', avgLane)

      const rosterSlots = roster.playerIds.map((slotId) => {
        if (slotId.startsWith('pick:')) {
          const m = bySleeperId.get(slotId)
          return {
            slotId,
            kind: 'pick' as const,
            name: m?.name ?? formatPickSlotId(slotId),
            position: 'PICK' as string | null,
            depthTier: 'bench' as DepthTier,
            avg: m ? avgLane(m, metricLane) : null,
            deltaFc: null as number | null,
            deltaDd: null as number | null,
          }
        }
        const m = bySleeperId.get(slotId)
        const pl = players.find((p) => p.playerId === slotId)
        const depthTier: DepthTier = m ? (depthMap.get(m.sleeperId) ?? 'bench') : 'bench'
        const deltaFc = m
          ? metricLane === 'dynasty'
            ? m.dynDeltaNormFcVsKtc
            : m.rdDeltaNormFcVsKtc
          : null
        const deltaDd = m
          ? metricLane === 'dynasty'
            ? m.dynDeltaNormDdVsKtc
            : m.rdDeltaNormDdVsKtc
          : null
        return {
          slotId,
          kind: 'player' as const,
          name: m?.name ?? (pl ? `${pl.firstName} ${pl.lastName}` : slotId),
          position: m?.position ?? pl?.position ?? null,
          depthTier,
          avg: m ? avgLane(m, metricLane) : null,
          deltaFc,
          deltaDd,
        }
      })

      const rosterSlotsByAvg = [...rosterSlots].sort((a, b) => {
        if (a.avg == null && b.avg == null) return a.slotId.localeCompare(b.slotId)
        if (a.avg == null) return 1
        if (b.avg == null) return -1
        if (b.avg !== a.avg) return b.avg - a.avg
        return a.name.localeCompare(b.name)
      })

      return {
        roster,
        label: rosterDisplayName(roster, leagueSnapshot.users),
        starters,
        rosterSlots: rosterSlotsByAvg,
        otherCount: fullMetrics.filter((p) => !starterIds.has(p.sleeperId)).length,
        rawPower,
        rawKtc,
        rawFc,
        rawDd,
        rawQb,
        rawRb,
        rawWr,
        rawTe,
      }
    })

    const rawPowers = perTeam.map((r) => r.rawPower)
    const rawKtcs = perTeam.map((r) => r.rawKtc)
    const rawFcs = perTeam.map((r) => r.rawFc)
    const rawDds = perTeam.map((r) => r.rawDd)
    const rawQbs = perTeam.map((r) => r.rawQb)
    const rawRbs = perTeam.map((r) => r.rawRb)
    const rawWrs = perTeam.map((r) => r.rawWr)
    const rawTes = perTeam.map((r) => r.rawTe)

    const powerPct = tieAwarePercentiles(rawPowers)
    const ktcPct = tieAwarePercentiles(rawKtcs)
    const fcPct = tieAwarePercentiles(rawFcs)
    const ddPct = tieAwarePercentiles(rawDds)
    const qbPct = tieAwarePercentiles(rawQbs)
    const rbPct = tieAwarePercentiles(rawRbs)
    const wrPct = tieAwarePercentiles(rawWrs)
    const tePct = tieAwarePercentiles(rawTes)

    const powerOrd = competitionRanksHighIsBest(rawPowers)
    const ktcOrd = competitionRanksHighIsBest(rawKtcs)
    const fcOrd = competitionRanksHighIsBest(rawFcs)
    const ddOrd = competitionRanksHighIsBest(rawDds)
    const qbOrd = competitionRanksHighIsBest(rawQbs)
    const rbOrd = competitionRanksHighIsBest(rawRbs)
    const wrOrd = competitionRanksHighIsBest(rawWrs)
    const teOrd = competitionRanksHighIsBest(rawTes)

    const power9999 = normalizeLeagueMetricTo9999(rawPowers)
    const ktc9999 = normalizeLeagueMetricTo9999(rawKtcs)
    const fc9999 = normalizeLeagueMetricTo9999(rawFcs)
    const dd9999 = normalizeLeagueMetricTo9999(rawDds)
    const qb9999 = normalizeLeagueMetricTo9999(rawQbs)
    const rb9999 = normalizeLeagueMetricTo9999(rawRbs)
    const wr9999 = normalizeLeagueMetricTo9999(rawWrs)
    const te9999 = normalizeLeagueMetricTo9999(rawTes)

    const totalRawPower = rawPowers.reduce((a, b) => a + b, 0)

    return perTeam.map((r, i) => {
      const pickOrdinal = (ord: number[]) => ord[i] ?? 1
      const pickPct = (pct: number[]) => Math.round(pct[i] ?? 0)
      const pick9999 = (arr: number[]) => arr[i] ?? 0
      if (scoreDisplay === 'ordinal') {
        return {
          ...r,
          displayPower: pickOrdinal(powerOrd),
          displayKtc: pickOrdinal(ktcOrd),
          displayFc: pickOrdinal(fcOrd),
          displayDd: pickOrdinal(ddOrd),
          displayQb: pickOrdinal(qbOrd),
          displayRb: pickOrdinal(rbOrd),
          displayWr: pickOrdinal(wrOrd),
          displayTe: pickOrdinal(teOrd),
          portfolioSharePct: totalRawPower > 0 ? (100 * r.rawPower) / totalRawPower : 0,
        }
      }
      if (scoreDisplay === 'percentile') {
        return {
          ...r,
          displayPower: pickPct(powerPct),
          displayKtc: pickPct(ktcPct),
          displayFc: pickPct(fcPct),
          displayDd: pickPct(ddPct),
          displayQb: pickPct(qbPct),
          displayRb: pickPct(rbPct),
          displayWr: pickPct(wrPct),
          displayTe: pickPct(tePct),
          portfolioSharePct: totalRawPower > 0 ? (100 * r.rawPower) / totalRawPower : 0,
        }
      }
      return {
        ...r,
        displayPower: pick9999(power9999),
        displayKtc: pick9999(ktc9999),
        displayFc: pick9999(fc9999),
        displayDd: pick9999(dd9999),
        displayQb: pick9999(qb9999),
        displayRb: pick9999(rb9999),
        displayWr: pick9999(wr9999),
        displayTe: pick9999(te9999),
        portfolioSharePct: totalRawPower > 0 ? (100 * r.rawPower) / totalRawPower : 0,
      }
    })
  }, [
    leagueSnapshot,
    bySleeperId,
    metricLane,
    tierIncludes,
    powerMode,
    depthWeights,
    scoreDisplay,
    players,
  ])

  const sortedTeams = useMemo(
    () => [...teamRows].sort((a, b) => b.rawPower - a.rawPower || a.label.localeCompare(b.label)),
    [teamRows],
  )

  const formatScoreBadge = (label: string, value: number) => {
    if (scoreDisplay === 'ordinal') return `${label} #${value}`
    if (scoreDisplay === 'max9999') return `${label} ${value.toLocaleString()}`
    return `${label} ${value}`
  }

  const lane = laneLabel(metricLane)
  const pool = poolLabel(tierIncludes)

  const setWeight = (key: DepthTier, raw: string) => {
    const n = Number.parseFloat(raw)
    setDepthWeights((w) => ({ ...w, [key]: clampWeight(Number.isFinite(n) ? n : w[key]) }))
  }

  const badgeCtx = {
    lane: metricLane,
    normMode,
    scoreDisplay,
    tierIncludes,
    powerMode,
    depthWeights,
  }

  const filterPanel = (
    <div className="flex flex-col gap-3">
      <ConsensusIndicatorSettings className="rounded-lg border border-border bg-muted/20 p-3" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Metric:</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
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
              variant={metricLane === 'redraft' ? 'default' : 'outline'}
              onClick={() => setMetricLane('redraft')}
            >
              Redraft
            </Button>
          </TooltipTrigger>
          <TooltipContent>{explainLane('redraft')}</TooltipContent>
        </Tooltip>
        <span className="text-muted-foreground ml-2 text-sm">Scale:</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant={normMode === 'max' ? 'default' : 'outline'} onClick={() => setNormMode('max')}>
              Max
            </Button>
          </TooltipTrigger>
          <TooltipContent>{explainNormMode('max')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={normMode === 'quantile' ? 'default' : 'outline'}
              onClick={() => setNormMode('quantile')}
            >
              Quantile
            </Button>
          </TooltipTrigger>
          <TooltipContent>{explainNormMode('quantile')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Pool:</span>
        {(['starter', 'backup', 'bench'] as const).map((tier) => {
          const label = tier === 'starter' ? 'Starters' : tier === 'backup' ? 'Backups' : 'Bench'
          return (
            <Tooltip key={tier}>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={tierIncludes[tier] ? 'default' : 'outline'}
                  onClick={() => setTierIncludes((t) => ({ ...t, [tier]: !t[tier] }))}
                >
                  {label}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex flex-col gap-1">
                  <p>{explainTierToggle(tier)}</p>
                  <p className="text-muted-foreground">Current pool: {pool}.</p>
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Power:</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={powerMode === 'additive' ? 'default' : 'outline'}
              onClick={() => setPowerMode('additive')}
            >
              Additive
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {explainPowerMode('additive', tierIncludes, depthWeights)}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={powerMode === 'depthWeighted' ? 'default' : 'outline'}
              onClick={() => setPowerMode('depthWeighted')}
            >
              Depth-weighted
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {explainPowerMode('depthWeighted', tierIncludes, depthWeights)}
          </TooltipContent>
        </Tooltip>
      </div>

      {powerMode === 'depthWeighted' && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/20 p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground cursor-help text-xs font-medium underline decoration-dotted">
                Depth weights (avg norm)
              </span>
            </TooltipTrigger>
            <TooltipContent>{explainDepthWeights()}</TooltipContent>
          </Tooltip>
          {(['starter', 'backup', 'bench'] as const).map((tier) => (
            <label key={tier} className="flex flex-col gap-0.5 text-xs">
              <span className="text-muted-foreground capitalize">{tier}</span>
              <Input
                className="h-8 w-20 font-mono text-xs"
                value={String(depthWeights[tier])}
                onChange={(e) => setWeight(tier, e.target.value)}
              />
            </label>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDepthWeights(() => ({ ...DEFAULT_DEPTH_WEIGHTS }))}
          >
            Reset weights
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Badges:</span>
        {(['max9999', 'ordinal', 'percentile'] as const).map((sd) => {
          const label = sd === 'max9999' ? 'Max 9999' : sd === 'ordinal' ? 'Ordinal rank' : 'Percentile (1-99)'
          return (
            <Tooltip key={sd}>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={scoreDisplay === sd ? 'default' : 'outline'}
                  onClick={() => setScoreDisplay(sd as ScoreDisplay)}
                >
                  {label}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{explainScoreDisplay(sd as ScoreDisplay)}</TooltipContent>
            </Tooltip>
          )
        })}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={showPortfolioShare ? 'default' : 'outline'}
              className="ml-2"
              onClick={() => setShowPortfolioShare(!showPortfolioShare)}
            >
              League total %
            </Button>
          </TooltipTrigger>
          <TooltipContent>{explainPortfolioShare(showPortfolioShare)}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-4 sm:px-4">
      <PageSubheader className="mx-[-0.75rem] sm:mx-[-1rem]">
        <div className="relative h-12 w-full min-w-0">
          <div className="absolute inset-0 hidden min-w-0 items-center gap-2 sm:flex">
            <Popover open={!leagueFiltersCollapsed} onOpenChange={(open) => setLeagueFiltersCollapsed(!open)}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-2">
                  <SlidersHorizontal className="size-4" />
                  Filters
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="max-h-[min(72vh,560px)] w-[min(calc(100vw-2rem),54rem)] overflow-y-auto p-3"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {filterPanel}
              </PopoverContent>
            </Popover>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {lane} · {normMode} · {pool} · {powerMode === 'additive' ? 'additive' : 'depth-weighted'} power · {scoreDisplay}
            </span>
            <Link to="/settings" className="ml-auto shrink-0">
              <Button type="button" variant="ghost" size="icon" className="size-8" title="Settings">
                <Settings className="size-4" />
                <span className="sr-only">Settings</span>
              </Button>
            </Link>
          </div>

          <div className="absolute inset-0 flex min-w-0 items-center gap-2 sm:hidden">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {lane} · {normMode} · {pool}
            </span>
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="size-9 shrink-0" title="Filters">
                  <SlidersHorizontal className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="flex h-[min(75vh,560px)] flex-col overflow-hidden">
                <SheetHeader className="shrink-0">
                  <SheetTitle>League filters</SheetTitle>
                </SheetHeader>
                <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">{filterPanel}</div>
              </SheetContent>
            </Sheet>
            <Link to="/settings" className="shrink-0">
              <Button type="button" variant="ghost" size="icon" className="size-9" title="Settings">
                <Settings className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </PageSubheader>

      {aggregated.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">
          No player values synced yet. Run <code className="bg-muted rounded px-1 py-0.5 text-xs">pnpm sync</code> or use Sync.
        </p>
      ) : (
        <Tabs
          value={overviewTab}
          onValueChange={(v) => setOverviewTab(v as 'teams' | 'positions')}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="self-start">
            <TabsTrigger value="teams">Teams</TabsTrigger>
            <TabsTrigger value="positions">Positions</TabsTrigger>
          </TabsList>

          <TabsContent value="teams" className="mt-3 flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-4 overflow-auto pb-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedTeams.map((row) => (
                <Card key={row.roster.rosterId} className="flex min-h-0 flex-col overflow-hidden border-border shadow-sm">
                  <CardHeader className="space-y-3 pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="text-lg leading-tight">
                        <Link
                          to="/league/$leagueId/team/$rosterId"
                          params={{ leagueId, rosterId: String(row.roster.rosterId) }}
                          className="hover:underline"
                        >
                          {row.label}
                        </Link>
                      </CardTitle>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="secondary"
                              className={cn(
                                'cursor-help tabular-nums font-semibold',
                                scoreDisplay === 'max9999' ? 'text-sm' : 'text-base',
                              )}
                            >
                              {formatScoreBadge('Power', row.displayPower)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-1">
                              <p>{explainBadge('Power', badgeCtx)}</p>
                              <p className="text-muted-foreground">
                                Raw Σ for this team: {Math.round(row.rawPower).toLocaleString()}.
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                        <span className="text-muted-foreground text-xs tabular-nums">Σ {Math.round(row.rawPower)}</span>
                        {showPortfolioShare ? (
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {row.portfolioSharePct.toFixed(1)}% of league Σ
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['KTC', 'DD', 'FC'] as const).map((src) => {
                        const v =
                          src === 'KTC' ? row.displayKtc : src === 'DD' ? row.displayDd : row.displayFc
                        return (
                          <Tooltip key={src}>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'cursor-help tabular-nums',
                                  scoreDisplay === 'max9999' && 'text-xs',
                                )}
                              >
                                {formatScoreBadge(src, v)}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>{explainBadge(src, badgeCtx)}</TooltipContent>
                          </Tooltip>
                        )
                      })}
                      {(['QB', 'RB', 'WR', 'TE'] as const).map((pos) => {
                        const v =
                          pos === 'QB'
                            ? row.displayQb
                            : pos === 'RB'
                              ? row.displayRb
                              : pos === 'WR'
                                ? row.displayWr
                                : row.displayTe
                        return (
                          <Tooltip key={pos}>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'cursor-help tabular-nums text-muted-foreground',
                                  scoreDisplay === 'max9999' && 'text-xs',
                                )}
                              >
                                {formatScoreBadge(pos, v)}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {explainPositionBadge(pos, {
                                lane: metricLane,
                                normMode,
                                scoreDisplay,
                                tierIncludes,
                              })}
                            </TooltipContent>
                          </Tooltip>
                        )
                      })}
                    </div>
                    <CardDescription className="text-xs">
                      Pool: {pool} · {powerMode === 'additive' ? 'additive' : 'depth-weighted'} power · Sorted by avg ({lane}) · “—” = no value
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col gap-0 border-t border-border pt-3">
                    <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">Roster</p>
                    <ul className="max-h-[min(420px,55vh)] space-y-1.5 overflow-y-auto pr-1 text-sm">
                      {row.rosterSlots.map((slot) => (
                        <li
                          key={slot.slotId}
                          className={cn(
                            'flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-md border border-transparent px-2 py-1.5',
                            slot.depthTier === 'starter' && 'border-primary/25 bg-primary/5',
                            slot.depthTier === 'backup' && 'border-border bg-muted/40',
                            slot.depthTier === 'bench' && 'opacity-95',
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">{slot.name}</span>
                            {slot.position ? (
                              <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                                {slot.position}
                              </Badge>
                            ) : null}
                            {slot.depthTier === 'starter' ? (
                              <Badge className="ml-2 align-middle text-[10px]" variant="default">
                                Starter
                              </Badge>
                            ) : slot.depthTier === 'backup' ? (
                              <Badge className="ml-2 align-middle text-[10px]" variant="secondary">
                                Backup
                              </Badge>
                            ) : (
                              <Badge className="ml-2 align-middle text-[10px]" variant="outline">
                                Bench
                              </Badge>
                            )}
                            {slot.kind === 'player' ? (
                              <ConsensusFlag
                                className="ml-1.5"
                                lane={metricLane}
                                player={bySleeperId.get(slot.slotId)}
                                minAbsDeltaPercentileCutoff={consensusCutoffLane}
                                deltaFc={slot.deltaFc}
                                deltaDd={slot.deltaDd}
                              />
                            ) : null}
                          </div>
                          <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
                            {slot.avg != null ? slot.avg.toLocaleString() : '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="positions" className="mt-3 flex min-h-0 flex-1 flex-col">
            <PositionalOverviewTable
              teams={sortedTeams}
              leagueId={leagueId}
              scoreDisplay={scoreDisplay}
              positionTooltipCtx={{
                lane: metricLane,
                normMode,
                scoreDisplay,
                tierIncludes,
              }}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

interface PosTableRow {
  rosterId: number
  label: string
  qb: number
  rb: number
  wr: number
  te: number
}

interface PositionalOverviewTableProps {
  teams: Array<{
    roster: { rosterId: number }
    label: string
    displayQb: number
    displayRb: number
    displayWr: number
    displayTe: number
  }>
  leagueId: string
  scoreDisplay: ScoreDisplay
  positionTooltipCtx: Parameters<typeof explainPositionBadge>[1]
}

function PositionalOverviewTable({
  teams,
  leagueId,
  scoreDisplay,
  positionTooltipCtx,
}: PositionalOverviewTableProps) {
  const data = useMemo<PosTableRow[]>(
    () =>
      teams.map((t) => ({
        rosterId: t.roster.rosterId,
        label: t.label,
        qb: t.displayQb,
        rb: t.displayRb,
        wr: t.displayWr,
        te: t.displayTe,
      })),
    [teams],
  )

  const [sorting, setSorting] = useState<SortingState>([{ id: 'qb', desc: true }])

  const formatPosCell = (val: number) => {
    if (scoreDisplay === 'ordinal') return `#${val}`
    if (scoreDisplay === 'max9999') return val.toLocaleString()
    return String(val)
  }

  const headerWithTooltip = (pos: 'QB' | 'RB' | 'WR' | 'TE') => () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted">{pos}</span>
      </TooltipTrigger>
      <TooltipContent>{explainPositionBadge(pos, positionTooltipCtx)}</TooltipContent>
    </Tooltip>
  )

  const columns = useMemo<ColumnDef<PosTableRow>[]>(
    () => [
      {
        accessorKey: 'label',
        header: 'Team',
        cell: ({ row }) => (
          <Link
            to="/league/$leagueId/team/$rosterId"
            params={{ leagueId, rosterId: String(row.original.rosterId) }}
            className="font-medium hover:underline"
          >
            {row.original.label}
          </Link>
        ),
      },
      {
        accessorKey: 'qb',
        header: headerWithTooltip('QB'),
        cell: ({ getValue }) => <span className="tabular-nums">{formatPosCell(getValue() as number)}</span>,
      },
      {
        accessorKey: 'rb',
        header: headerWithTooltip('RB'),
        cell: ({ getValue }) => <span className="tabular-nums">{formatPosCell(getValue() as number)}</span>,
      },
      {
        accessorKey: 'wr',
        header: headerWithTooltip('WR'),
        cell: ({ getValue }) => <span className="tabular-nums">{formatPosCell(getValue() as number)}</span>,
      },
      {
        accessorKey: 'te',
        header: headerWithTooltip('TE'),
        cell: ({ getValue }) => <span className="tabular-nums">{formatPosCell(getValue() as number)}</span>,
      },
    ],
    [leagueId, scoreDisplay, positionTooltipCtx],
  )

  const sortDescFirst = scoreDisplay !== 'ordinal'

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst,
  })

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <p className="border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Positional overview (avg norm by position)
      </p>
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
          {table.getRowModel().rows.map((row) => (
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
