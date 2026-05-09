import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FilterBarShell } from '@/components/ui/filter-bar-shell'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChevronDown } from 'lucide-react'
import { useLeagueRoute } from '@/lib/league-route-context'
import type { LeagueUser, Roster } from '@/lib/db/schema'
import { aggregatePlayerValues, type AggregatedPlayer } from '@/lib/rankings/player-metrics'
import { avgLane, type DepthTier } from '@/lib/rankings/league-board-power-input'
import { depthTierByPlayerId } from '@/lib/rankings/league-board-depth'
import { cn } from '@/lib/utils'
import { DeltaTable } from '@/components/league/delta-table'
import { ConsensusFlag } from '@/components/league/consensus-flag'
import { computeMinAbsDeltaPercentileCutoff } from '@/lib/rankings/consensus-threshold'
import { useUiSettings } from '@/lib/stores/ui-settings'
import { explainLane, laneLabel } from '@/lib/rankings/explain'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

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
  const setMetricLane = useUiSettings((s) => s.setMetricLane)
  const normMode = useUiSettings((s) => s.normMode)
  const hidePickRows = useUiSettings((s) => s.hidePickRows)
  const setHidePickRows = useUiSettings((s) => s.setHidePickRows)
  const teamFiltersCollapsed = useUiSettings((s) => s.teamFiltersCollapsed)
  const setTeamFiltersCollapsed = useUiSettings((s) => s.setTeamFiltersCollapsed)

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

  const displayedSlots = useMemo(() => {
    if (!hidePickRows) return rosterSlots
    return rosterSlots.filter((s) => s.kind !== 'pick')
  }, [rosterSlots, hidePickRows])

  const teamLabel = rosterDisplayName(roster, leagueSnapshot.users)
  const owner = ownerDisplayName(roster, leagueSnapshot.users)
  const lane = laneLabel(metricLane)

  const toolbarInner = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
      </div>
      <div className="border-border flex flex-wrap items-center gap-2 border-l pl-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={hidePickRows ? 'default' : 'outline'}
              onClick={() => setHidePickRows(!hidePickRows)}
            >
              Hide picks (table)
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Hides draft pick rows from the roster list below. Power totals use Settings → Include picks in power.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="text-muted-foreground border-border flex flex-wrap items-center border-l pl-3 text-xs">
        Norm scale: <span className="text-foreground font-medium">{normMode}</span> ·{' '}
        <Link to="/settings" className="underline">
          Settings
        </Link>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 sm:px-4">
      <div className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/95 py-2 backdrop-blur">
        <div className="hidden sm:block">
          <FilterBarShell
            filtersCollapsed={teamFiltersCollapsed}
            onFiltersCollapsedChange={setTeamFiltersCollapsed}
            bar={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 px-2"
                  onClick={() => setTeamFiltersCollapsed(!teamFiltersCollapsed)}
                >
                  Filters
                  <ChevronDown
                    className={cn('size-4 transition-transform', !teamFiltersCollapsed && 'rotate-180')}
                  />
                </Button>
                {teamFiltersCollapsed ? (
                  <span className="text-muted-foreground text-xs">
                    {laneLabel(metricLane)} · {normMode} · tap to expand
                  </span>
                ) : null}
              </div>
            }
            desktopOverlay={<div className="pt-1">{toolbarInner}</div>}
          />
        </div>
        <div className="sm:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                Filters
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[min(70vh,520px)]">
              <SheetHeader>
                <SheetTitle>Team filters</SheetTitle>
              </SheetHeader>
              <div className="mt-4">{toolbarInner}</div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

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

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">
            Values ({lane}) · roster sorted by avg norm · depth badges reflect optimal lineup assumptions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="min-h-[280px] flex-1">
            <DeltaTable
              players={rosterPlayers}
              lane={metricLane}
              percentileReferencePlayers={aggregated}
              topN={null}
              leagueId={leagueId}
            />
          </div>

          <div>
            <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
              Roster slots ({lane})
            </p>
            <ul className="max-h-[min(420px,55vh)] space-y-1.5 overflow-y-auto pr-1 text-sm">
              {displayedSlots.map((slot) => (
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
                    {slot.kind === 'player' ? (
                      <Link
                        to="/player/$sleeperId"
                        params={{ sleeperId: slot.slotId }}
                        search={{ leagueId }}
                        className="font-medium hover:underline"
                      >
                        {slot.name}
                      </Link>
                    ) : (
                      <Link
                        to="/player/$sleeperId"
                        params={{ sleeperId: slot.slotId }}
                        search={{ leagueId }}
                        className="font-medium hover:underline"
                      >
                        {slot.name}
                      </Link>
                    )}
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
