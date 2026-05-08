import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { readPlayers, readValues } from '@/server/functions/read-data'
import { getLeagueRosterSnapshot } from '@/server/functions/sync-sleeper'
import type { LeagueUser, Roster } from '@/lib/db/schema'
import { aggregatePlayerValues, type AggregatedPlayer } from '@/lib/rankings/player-metrics'
import { avgLane, type DepthTier } from '@/lib/rankings/league-board-power-input'
import { depthTierByPlayerId } from '@/lib/rankings/league-board-depth'
import { cn } from '@/lib/utils'
import { DeltaTable } from '@/components/league/delta-table'
import { ConsensusFlag } from '@/components/league/consensus-flag'
import { ConsensusIndicatorSettings } from '@/components/league/consensus-indicator-settings'
import { computeMinAbsDeltaPercentileCutoff } from '@/lib/rankings/consensus-threshold'
import {
  LEAGUE_FETCHED_AT_STORAGE_KEY,
  LEAGUE_ID_STORAGE_KEY,
  notifyLeagueStorageChanged,
} from '@/lib/league-storage'
import { useUiSettings } from '@/lib/stores/ui-settings'
import { explainLane, explainNormMode, laneLabel } from '@/lib/rankings/explain'

function rosterDisplayName(roster: Roster, users: LeagueUser[]) {
  const u = users.find((x) => x.userId === roster.ownerId)
  return u?.teamName ?? u?.displayName ?? `Roster ${roster.rosterId}`
}

function ownerDisplayName(roster: Roster, users: LeagueUser[]) {
  const u = users.find((x) => x.userId === roster.ownerId)
  return u?.displayName ?? null
}

function formatPickSlotId(slotId: string): string {
  return slotId.replace(/^pick:/, '').replace(/:/g, ' ').toUpperCase()
}

export const Route = createFileRoute('/league/$leagueId/team/$rosterId')({
  loader: async ({ params }) => {
    const [players, values, leagueSnapshot] = await Promise.all([
      readPlayers(),
      readValues(),
      getLeagueRosterSnapshot({ data: { leagueId: params.leagueId } }),
    ])
    const rosterId = Number(params.rosterId)
    if (!Number.isFinite(rosterId)) throw notFound()
    const roster = leagueSnapshot.rosters.find((r) => r.rosterId === rosterId)
    if (!roster) throw notFound()
    return { players, values, leagueSnapshot, roster }
  },
  component: TeamPage,
})

function TeamPage() {
  const { leagueId } = Route.useParams()
  const { players, values, leagueSnapshot, roster } = Route.useLoaderData()

  const metricLane = useUiSettings((s) => s.metricLane)
  const setMetricLane = useUiSettings((s) => s.setMetricLane)
  const normMode = useUiSettings((s) => s.normMode)
  const setNormMode = useUiSettings((s) => s.setNormMode)

  useEffect(() => {
    try {
      localStorage.setItem(LEAGUE_ID_STORAGE_KEY, leagueId)
      localStorage.setItem(LEAGUE_FETCHED_AT_STORAGE_KEY, leagueSnapshot.fetchedAt)
      notifyLeagueStorageChanged()
    } catch {
      /* ignore */
    }
  }, [leagueId, leagueSnapshot.fetchedAt])

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

  const rosterPlayers = useMemo(() => {
    const out: AggregatedPlayer[] = []
    for (const id of roster.playerIds) {
      if (id.startsWith('pick:')) continue
      const m = bySleeperId.get(id)
      if (m) out.push(m)
    }
    return out
  }, [roster.playerIds, bySleeperId])

  const depthMap = useMemo(
    () => depthTierByPlayerId(rosterPlayers, metricLane),
    [rosterPlayers, metricLane],
  )

  const rosterSlots = useMemo(() => {
    const slots = roster.playerIds.map((slotId) => {
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
    return slots.sort((a, b) => {
      if (a.avg == null && b.avg == null) return a.slotId.localeCompare(b.slotId)
      if (a.avg == null) return 1
      if (b.avg == null) return -1
      if (b.avg !== a.avg) return b.avg - a.avg
      return a.name.localeCompare(b.name)
    })
  }, [roster.playerIds, bySleeperId, depthMap, metricLane, players])

  const teamLabel = rosterDisplayName(roster, leagueSnapshot.users)
  const owner = ownerDisplayName(roster, leagueSnapshot.users)
  const lane = laneLabel(metricLane)

  return (
    <div className="container mx-auto flex min-h-0 flex-1 flex-col gap-4 px-3 py-4 sm:px-4">
      <div className="shrink-0 space-y-1">
        <p className="text-muted-foreground text-sm">
          <Link to="/league/$leagueId" params={{ leagueId }} className="underline">
            ← {leagueSnapshot.league.name}
          </Link>{' '}
          · {leagueSnapshot.league.season}
        </p>
        <h1 className="text-3xl font-bold">{teamLabel}</h1>
        <p className="text-muted-foreground text-sm">
          {owner ? `${owner} · ` : ''}
          {roster.wins}-{roster.losses}
          {roster.ties ? `-${roster.ties}` : ''} ·{' '}
          <Link to="/league/$leagueId/waiver" params={{ leagueId }} className="underline">
            Waiver wire
          </Link>{' '}
          ·{' '}
          <Link to="/rankings" search={{ leagueId }} className="underline">
            Rankings
          </Link>
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
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

      <ConsensusIndicatorSettings className="shrink-0 rounded-lg border border-border bg-muted/20 p-3" />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Roster</CardTitle>
            <p className="text-muted-foreground text-xs">
              Sorted by avg norm ({lane}); depth tiers via QB/TE +1, WR/RB +2 past value-optimal nine.
            </p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-0 border-t border-border pt-3">
            <ul className="space-y-1.5 overflow-y-auto pr-1 text-sm">
              {rosterSlots.map((slot) => (
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

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mispricing deltas</CardTitle>
            <p className="text-muted-foreground text-xs">
              Δ FC / DD / Avg vs KTC for this team’s rostered players ({lane}). Sort any Δ column to flip
              sign — descending shows biggest positive (player is valued higher than KTC), ascending shows biggest
              negative.
            </p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-0 border-t border-border pt-3">
            <DeltaTable
              players={rosterPlayers}
              lane={metricLane}
              percentileReferencePlayers={aggregated}
              topN={null}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
