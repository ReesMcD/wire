import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { readPlayers, readValues } from '@/server/functions/read-data'
import type { LeagueUser, Roster } from '@/lib/db/schema'
import { aggregatePlayerValues, type AggregatedPlayer, type NormMode } from '@/lib/rankings/player-metrics'
import {
  avgLane,
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
import {
  LEAGUE_FETCHED_AT_STORAGE_KEY,
  LEAGUE_ID_STORAGE_KEY,
  notifyLeagueStorageChanged,
} from '@/lib/league-storage'
import { getLeagueRosterSnapshot } from '@/server/functions/sync-sleeper'
import { cn } from '@/lib/utils'

const NORM_MODE_STORAGE_KEY = 'rankings-norm-mode'
const STARTERS_ONLY_LEGACY_KEY = 'league-board-starters-only'
const TIER_INCLUDES_STORAGE_KEY = 'league-board-tier-includes'
const POWER_MODE_STORAGE_KEY = 'league-board-power-mode'
const DEPTH_WEIGHTS_STORAGE_KEY = 'league-board-depth-weights'
const SCORE_DISPLAY_STORAGE_KEY = 'league-board-score-display'
const PORTFOLIO_SHARE_STORAGE_KEY = 'league-board-portfolio-share'

type PowerMode = 'additive' | 'depthWeighted'
type ScoreDisplay = 'max9999' | 'ordinal' | 'percentile'

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

function readTierIncludesFromStorage(): {
  starter: boolean
  backup: boolean
  bench: boolean
} {
  if (typeof window === 'undefined') {
    return { starter: true, backup: true, bench: true }
  }
  try {
    const raw = localStorage.getItem(TIER_INCLUDES_STORAGE_KEY)
    if (raw) {
      const j = JSON.parse(raw) as Record<string, unknown>
      return {
        starter: j.starter !== false,
        backup: j.backup !== false,
        bench: j.bench !== false,
      }
    }
    const legacy = localStorage.getItem(STARTERS_ONLY_LEGACY_KEY)
    if (legacy === '1' || legacy === 'true') {
      return { starter: true, backup: false, bench: false }
    }
  } catch {
    /* ignore */
  }
  return { starter: true, backup: true, bench: true }
}

function readDepthWeightsFromStorage(): Record<DepthTier, number> {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_DEPTH_WEIGHTS }
  }
  try {
    const raw = localStorage.getItem(DEPTH_WEIGHTS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_DEPTH_WEIGHTS }
    const j = JSON.parse(raw) as Record<string, number>
    const starter = clampWeight(j.starter ?? DEFAULT_DEPTH_WEIGHTS.starter)
    const backup = clampWeight(j.backup ?? DEFAULT_DEPTH_WEIGHTS.backup)
    const bench = clampWeight(j.bench ?? DEFAULT_DEPTH_WEIGHTS.bench)
    return { starter, backup, bench }
  } catch {
    return { ...DEFAULT_DEPTH_WEIGHTS }
  }
}

function clampWeight(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

export const Route = createFileRoute('/league-board')({
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
  component: LeagueBoardPage,
})

function LeagueBoardPage() {
  const navigate = useNavigate({ from: '/league-board' })
  const search = Route.useSearch()
  const { players, values, leagueSnapshot } = Route.useLoaderData()
  const hydratedUrl = useRef(false)
  const migratedLegacyStarters = useRef(false)

  const [leagueInput, setLeagueInput] = useState('')
  const [normMode, setNormMode] = useState<NormMode>('quantile')
  const [metricLane, setMetricLane] = useState<MetricLane>('dynasty')
  const [tierIncludes, setTierIncludes] = useState(() => readTierIncludesFromStorage())
  const [powerMode, setPowerMode] = useState<PowerMode>(() => {
    if (typeof window === 'undefined') return 'additive'
    try {
      const v = localStorage.getItem(POWER_MODE_STORAGE_KEY)
      if (v === 'depthWeighted') return 'depthWeighted'
    } catch {
      /* ignore */
    }
    return 'additive'
  })
  const [depthWeights, setDepthWeights] = useState<Record<DepthTier, number>>(() => readDepthWeightsFromStorage())
  const [scoreDisplay, setScoreDisplay] = useState<ScoreDisplay>(() => {
    if (typeof window === 'undefined') return 'max9999'
    try {
      const v = localStorage.getItem(SCORE_DISPLAY_STORAGE_KEY)
      if (v === 'ordinal' || v === 'percentile' || v === 'max9999') return v
    } catch {
      /* ignore */
    }
    return 'max9999'
  })
  const [showPortfolioShare, setShowPortfolioShare] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem(PORTFOLIO_SHARE_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (migratedLegacyStarters.current) return
    migratedLegacyStarters.current = true
    try {
      const legacy = localStorage.getItem(STARTERS_ONLY_LEGACY_KEY)
      if (legacy === '1' || legacy === 'true') {
        localStorage.removeItem(STARTERS_ONLY_LEGACY_KEY)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(
        TIER_INCLUDES_STORAGE_KEY,
        JSON.stringify({
          starter: tierIncludes.starter,
          backup: tierIncludes.backup,
          bench: tierIncludes.bench,
        }),
      )
    } catch {
      /* ignore */
    }
  }, [tierIncludes])

  useEffect(() => {
    try {
      localStorage.setItem(POWER_MODE_STORAGE_KEY, powerMode)
    } catch {
      /* ignore */
    }
  }, [powerMode])

  useEffect(() => {
    try {
      localStorage.setItem(DEPTH_WEIGHTS_STORAGE_KEY, JSON.stringify(depthWeights))
    } catch {
      /* ignore */
    }
  }, [depthWeights])

  useEffect(() => {
    try {
      localStorage.setItem(SCORE_DISPLAY_STORAGE_KEY, scoreDisplay)
    } catch {
      /* ignore */
    }
  }, [scoreDisplay])

  useEffect(() => {
    try {
      localStorage.setItem(PORTFOLIO_SHARE_STORAGE_KEY, showPortfolioShare ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [showPortfolioShare])

  useEffect(() => {
    try {
      const s = localStorage.getItem(NORM_MODE_STORAGE_KEY)
      if (s === 'quantile' || s === 'max') setNormMode(s)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(NORM_MODE_STORAGE_KEY, normMode)
    } catch {
      /* ignore */
    }
  }, [normMode])

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

  const aggregated = useMemo(
    () => aggregatePlayerValues(players, values, normMode),
    [players, values, normMode],
  )

  const bySleeperId = useMemo(() => new Map(aggregated.map((p) => [p.sleeperId, p])), [aggregated])

  const tierAllowed = (tier: DepthTier) =>
    (tier === 'starter' && tierIncludes.starter) ||
    (tier === 'backup' && tierIncludes.backup) ||
    (tier === 'bench' && tierIncludes.bench)

  const teamRows = useMemo(() => {
    if (!leagueSnapshot) return []

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
          }
        }
        const m = bySleeperId.get(slotId)
        const pl = players.find((p) => p.playerId === slotId)
        const depthTier: DepthTier = m ? (depthMap.get(m.sleeperId) ?? 'bench') : 'bench'
        return {
          slotId,
          kind: 'player' as const,
          name: m?.name ?? (pl ? `${pl.firstName} ${pl.lastName}` : slotId),
          position: m?.position ?? pl?.position ?? null,
          depthTier,
          avg: m ? avgLane(m, metricLane) : null,
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
        rawQb,
        rawRb,
        rawWr,
        rawTe,
      }
    })

    const rawPowers = perTeam.map((r) => r.rawPower)
    const rawKtcs = perTeam.map((r) => r.rawKtc)
    const rawFcs = perTeam.map((r) => r.rawFc)
    const rawQbs = perTeam.map((r) => r.rawQb)
    const rawRbs = perTeam.map((r) => r.rawRb)
    const rawWrs = perTeam.map((r) => r.rawWr)
    const rawTes = perTeam.map((r) => r.rawTe)

    const powerPct = tieAwarePercentiles(rawPowers)
    const ktcPct = tieAwarePercentiles(rawKtcs)
    const fcPct = tieAwarePercentiles(rawFcs)
    const qbPct = tieAwarePercentiles(rawQbs)
    const rbPct = tieAwarePercentiles(rawRbs)
    const wrPct = tieAwarePercentiles(rawWrs)
    const tePct = tieAwarePercentiles(rawTes)

    const powerOrd = competitionRanksHighIsBest(rawPowers)
    const ktcOrd = competitionRanksHighIsBest(rawKtcs)
    const fcOrd = competitionRanksHighIsBest(rawFcs)
    const qbOrd = competitionRanksHighIsBest(rawQbs)
    const rbOrd = competitionRanksHighIsBest(rawRbs)
    const wrOrd = competitionRanksHighIsBest(rawWrs)
    const teOrd = competitionRanksHighIsBest(rawTes)

    const power9999 = normalizeLeagueMetricTo9999(rawPowers)
    const ktc9999 = normalizeLeagueMetricTo9999(rawKtcs)
    const fc9999 = normalizeLeagueMetricTo9999(rawFcs)
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

  const formatScoreBadge = (label: string, value: number) => {
    if (scoreDisplay === 'ordinal') return `${label} #${value}`
    if (scoreDisplay === 'max9999') return `${label} ${value.toLocaleString()}`
    return `${label} ${value}`
  }

  if (!search.leagueId || !leagueSnapshot) {
    return (
      <div className="container mx-auto max-w-lg space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-bold">League board</h1>
          <p className="text-muted-foreground mt-2">
            Compare roster strength using synced FC/KTC norms. Load a Sleeper league ID (same as Rankings), or open{' '}
            <Link to="/rankings" search={{ leagueId: undefined }} className="text-foreground underline">
              Rankings
            </Link>{' '}
            first and return here.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>League ID</CardTitle>
            <CardDescription>Paste your Sleeper league ID from the league URL.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-muted-foreground text-xs font-medium">Sleeper league ID</span>
              <Input
                placeholder="e.g. from league URL…"
                value={leagueInput}
                onChange={(e) => setLeagueInput(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <Button type="button" onClick={onLoadLeague}>
              Load league
            </Button>
            <Button type="button" variant="outline" onClick={onClearLeague}>
              Clear
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const laneLabel = metricLane === 'dynasty' ? 'Dynasty' : 'Redraft'
  const poolParts: string[] = []
  if (tierIncludes.starter) poolParts.push('starters')
  if (tierIncludes.backup) poolParts.push('backups')
  if (tierIncludes.bench) poolParts.push('bench')
  const poolLabel = poolParts.length ? poolParts.join(' + ') : 'none (empty pool)'

  const setWeight = (key: DepthTier, raw: string) => {
    const n = Number.parseFloat(raw)
    setDepthWeights((w) => ({ ...w, [key]: clampWeight(Number.isFinite(n) ? n : w[key]) }))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-3 py-4 sm:px-4">
      <div className="shrink-0 space-y-2">
        <h1 className="text-3xl font-bold">League board</h1>
        <p className="text-muted-foreground max-w-3xl">
          Each card lists every player and pick, sorted by <strong className="text-foreground">avg norm</strong> ({laneLabel}).{' '}
          <strong className="text-foreground">Starter</strong> / <strong className="text-foreground">Backup</strong> /{' '}
          <strong className="text-foreground">Bench</strong> follow QB/TE +1 and WR/RB +2 depth past the value-optimal nine. Pool toggles filter who counts toward sums;{' '}
          <strong className="text-foreground">Power</strong> is additive or depth-weighted. By default, badge numbers are each metric’s team total <strong className="text-foreground">max-scaled to 0–9999</strong> within the league (same idea as player norms). You can switch to <strong className="text-foreground">ordinal rank</strong> (#1 = best) or legacy <strong className="text-foreground">percentile</strong> (1–99).
        </p>
        <p className="text-muted-foreground text-sm">
          <span className="font-medium text-foreground">{leagueSnapshot.league.name}</span> · {leagueSnapshot.league.season}{' '}
          ·{' '}
          <Link to="/rankings" search={{ leagueId: search.leagueId }} className="underline">
            Rankings (same league)
          </Link>
        </p>
      </div>

      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Metric:</span>
          <Button
            size="sm"
            variant={metricLane === 'dynasty' ? 'default' : 'outline'}
            onClick={() => setMetricLane('dynasty')}
          >
            Dynasty
          </Button>
          <Button
            size="sm"
            variant={metricLane === 'redraft' ? 'default' : 'outline'}
            onClick={() => setMetricLane('redraft')}
          >
            Redraft
          </Button>
          <span className="text-muted-foreground ml-2 text-sm">Scale:</span>
          <Button size="sm" variant={normMode === 'max' ? 'default' : 'outline'} onClick={() => setNormMode('max')}>
            Max
          </Button>
          <Button
            size="sm"
            variant={normMode === 'quantile' ? 'default' : 'outline'}
            onClick={() => setNormMode('quantile')}
          >
            Quantile
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Pool:</span>
          <Button
            size="sm"
            variant={tierIncludes.starter ? 'default' : 'outline'}
            onClick={() => setTierIncludes((t) => ({ ...t, starter: !t.starter }))}
          >
            Starters
          </Button>
          <Button
            size="sm"
            variant={tierIncludes.backup ? 'default' : 'outline'}
            onClick={() => setTierIncludes((t) => ({ ...t, backup: !t.backup }))}
          >
            Backups
          </Button>
          <Button
            size="sm"
            variant={tierIncludes.bench ? 'default' : 'outline'}
            onClick={() => setTierIncludes((t) => ({ ...t, bench: !t.bench }))}
          >
            Bench
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Power:</span>
          <Button
            size="sm"
            variant={powerMode === 'additive' ? 'default' : 'outline'}
            onClick={() => setPowerMode('additive')}
          >
            Additive
          </Button>
          <Button
            size="sm"
            variant={powerMode === 'depthWeighted' ? 'default' : 'outline'}
            onClick={() => setPowerMode('depthWeighted')}
          >
            Depth-weighted
          </Button>
        </div>

        {powerMode === 'depthWeighted' && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/20 p-3">
            <span className="text-muted-foreground text-xs font-medium">Depth weights (avg norm)</span>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-muted-foreground">Starter</span>
              <Input
                className="h-8 w-20 font-mono text-xs"
                value={String(depthWeights.starter)}
                onChange={(e) => setWeight('starter', e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-muted-foreground">Backup</span>
              <Input
                className="h-8 w-20 font-mono text-xs"
                value={String(depthWeights.backup)}
                onChange={(e) => setWeight('backup', e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-muted-foreground">Bench</span>
              <Input
                className="h-8 w-20 font-mono text-xs"
                value={String(depthWeights.bench)}
                onChange={(e) => setWeight('bench', e.target.value)}
              />
            </label>
            <Button type="button" size="sm" variant="outline" onClick={() => setDepthWeights({ ...DEFAULT_DEPTH_WEIGHTS })}>
              Reset weights
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Badges:</span>
          <Button
            size="sm"
            variant={scoreDisplay === 'max9999' ? 'default' : 'outline'}
            onClick={() => setScoreDisplay('max9999')}
            title="Per metric: team raw sum ÷ league max × 9999 (best team = 9999)"
          >
            Max 9999
          </Button>
          <Button
            size="sm"
            variant={scoreDisplay === 'ordinal' ? 'default' : 'outline'}
            onClick={() => setScoreDisplay('ordinal')}
            title="Competition rank: #1 best; ties share rank"
          >
            Ordinal rank
          </Button>
          <Button
            size="sm"
            variant={scoreDisplay === 'percentile' ? 'default' : 'outline'}
            onClick={() => setScoreDisplay('percentile')}
            title="Mid-rank tie percentiles on 1–99 (even spacing by team count)"
          >
            Percentile (1–99)
          </Button>
          <Button
            size="sm"
            variant={showPortfolioShare ? 'default' : 'outline'}
            className="ml-2"
            onClick={() => setShowPortfolioShare((v) => !v)}
          >
            League total %
          </Button>
        </div>
      </div>

      {aggregated.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">
          No player values synced yet. Run <code className="bg-muted rounded px-1 py-0.5 text-xs">pnpm sync</code> or use Sync.
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-4 overflow-auto pb-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedTeams.map((row) => (
            <Card key={row.roster.rosterId} className="flex min-h-0 flex-col overflow-hidden border-border shadow-sm">
              <CardHeader className="space-y-3 pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-lg leading-tight">{row.label}</CardTitle>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <Badge
                      variant="secondary"
                      className={cn(
                        'tabular-nums font-semibold',
                        scoreDisplay === 'max9999' ? 'text-sm' : 'text-base',
                      )}
                    >
                      {formatScoreBadge('Power', row.displayPower)}
                    </Badge>
                    <span className="text-muted-foreground text-xs tabular-nums">Σ {Math.round(row.rawPower)}</span>
                    {showPortfolioShare ? (
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {row.portfolioSharePct.toFixed(1)}% of league Σ
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className={cn('tabular-nums', scoreDisplay === 'max9999' && 'text-xs')}
                  >
                    {formatScoreBadge('KTC', row.displayKtc)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn('tabular-nums', scoreDisplay === 'max9999' && 'text-xs')}
                  >
                    {formatScoreBadge('FC', row.displayFc)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn('tabular-nums text-muted-foreground', scoreDisplay === 'max9999' && 'text-xs')}
                  >
                    {formatScoreBadge('QB', row.displayQb)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn('tabular-nums text-muted-foreground', scoreDisplay === 'max9999' && 'text-xs')}
                  >
                    {formatScoreBadge('RB', row.displayRb)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn('tabular-nums text-muted-foreground', scoreDisplay === 'max9999' && 'text-xs')}
                  >
                    {formatScoreBadge('WR', row.displayWr)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn('tabular-nums text-muted-foreground', scoreDisplay === 'max9999' && 'text-xs')}
                  >
                    {formatScoreBadge('TE', row.displayTe)}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Pool: {poolLabel} · {powerMode === 'additive' ? 'additive' : 'depth-weighted'} power · Badges:{' '}
                  {scoreDisplay === 'max9999'
                    ? 'max 9999 / league'
                    : scoreDisplay === 'ordinal'
                      ? 'ordinal'
                      : 'percentile'}{' '}
                  · Sorted by avg ({laneLabel}) · “—” = no value
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
      )}
    </div>
  )
}
