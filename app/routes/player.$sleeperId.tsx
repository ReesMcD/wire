import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { readPlayers, readValues } from '@/server/functions/read-data'
import { getLeagueRosterSnapshot, type LeagueRosterSnapshot } from '@/server/functions/sync-sleeper'
import {
  aggregatePlayerValues,
  type AggregatedPlayer,
} from '@/lib/rankings/player-metrics'
import { useUiSettings } from '@/lib/stores/ui-settings'
import { explainLane, laneLabel } from '@/lib/rankings/explain'
import { cn } from '@/lib/utils'

const NEIGHBORS = 8

export const Route = createFileRoute('/player/$sleeperId')({
  validateSearch: (search: Record<string, unknown>) => {
    const raw = search.leagueId
    return {
      leagueId:
        typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined,
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
  component: PlayerPage,
})

type LaneFields = {
  ktcValue: number | null
  ktcNorm: number | null
  ktcRank: number | null
  ktcPosRank: number | null
  fcValue: number | null
  fcNorm: number | null
  fcRank: number | null
  fcPosRank: number | null
  ddValue: number | null
  ddNorm: number | null
  ddRank: number | null
  ddPosRank: number | null
  avgNorm: number | null
  avgRank: number | null
  avgPosRank: number | null
}

function laneFields(p: AggregatedPlayer, lane: 'dynasty' | 'redraft'): LaneFields {
  if (lane === 'dynasty') {
    return {
      ktcValue: p.dynKtcValue,
      ktcNorm: p.dynKtcNorm,
      ktcRank: p.dynKtcRank,
      ktcPosRank: p.dynKtcPosRank,
      fcValue: p.dynFcValue,
      fcNorm: p.dynFcNorm,
      fcRank: p.dynFcRank,
      fcPosRank: p.dynFcPosRank,
      ddValue: p.dynDdValue,
      ddNorm: p.dynDdNorm,
      ddRank: p.dynDdRank,
      ddPosRank: p.dynDdPosRank,
      avgNorm: p.dynAvgNorm,
      avgRank: p.dynAvgRank,
      avgPosRank: p.dynAvgPosRank,
    }
  }
  return {
    ktcValue: p.rdKtcValue,
    ktcNorm: p.rdKtcNorm,
    ktcRank: p.rdKtcRank,
    ktcPosRank: p.rdKtcPosRank,
    fcValue: p.rdFcValue,
    fcNorm: p.rdFcNorm,
    fcRank: p.rdFcRank,
    fcPosRank: p.rdFcPosRank,
    ddValue: p.rdDdValue,
    ddNorm: p.rdDdNorm,
    ddRank: p.rdDdRank,
    ddPosRank: p.rdDdPosRank,
    avgNorm: p.rdAvgNorm,
    avgRank: p.rdAvgRank,
    avgPosRank: p.rdAvgPosRank,
  }
}

function rosterTeamFor(
  sleeperId: string,
  snapshot: LeagueRosterSnapshot | null,
): { rosterId: number; label: string } | null {
  if (!snapshot) return null
  for (const roster of snapshot.rosters) {
    if (!roster.playerIds.includes(sleeperId)) continue
    const owner = snapshot.users.find((u) => u.userId === roster.ownerId)
    return {
      rosterId: roster.rosterId,
      label: owner?.teamName ?? owner?.displayName ?? `Roster ${roster.rosterId}`,
    }
  }
  return null
}

function nearestByValue(
  pool: AggregatedPlayer[],
  target: AggregatedPlayer,
  valueOf: (p: AggregatedPlayer) => number | null,
  limit: number,
): { player: AggregatedPlayer; value: number; delta: number }[] {
  const targetVal = valueOf(target)
  if (targetVal == null) return []
  const candidates: { player: AggregatedPlayer; value: number; delta: number }[] = []
  for (const p of pool) {
    if (p.sleeperId === target.sleeperId) continue
    const v = valueOf(p)
    if (v == null) continue
    candidates.push({ player: p, value: v, delta: v - targetVal })
  }
  candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))
  return candidates.slice(0, limit)
}

function deltaCell(delta: number) {
  const sign = delta > 0 ? '+' : ''
  return (
    <span
      className={cn(
        'tabular-nums text-xs',
        delta > 0 && 'text-emerald-600 dark:text-emerald-500',
        delta < 0 && 'text-rose-600 dark:text-rose-500',
        delta === 0 && 'text-muted-foreground',
      )}
    >
      {sign}
      {delta.toLocaleString()}
    </span>
  )
}

function PlayerPage() {
  const { sleeperId } = Route.useParams()
  const { leagueId } = Route.useSearch()
  const { players, values, leagueSnapshot } = Route.useLoaderData()

  const metricLane = useUiSettings((s) => s.metricLane)
  const setMetricLane = useUiSettings((s) => s.setMetricLane)
  const normMode = useUiSettings((s) => s.normMode)

  const aggregated = useMemo(
    () => aggregatePlayerValues(players, values, normMode),
    [players, values, normMode],
  )

  const player = useMemo(
    () => aggregated.find((p) => p.sleeperId === sleeperId),
    [aggregated, sleeperId],
  )

  if (!player) throw notFound()

  const fields = laneFields(player, metricLane)
  const isPick = player.sleeperId.startsWith('pick:') || player.position === 'PICK'

  const rosterTeam = rosterTeamFor(player.sleeperId, leagueSnapshot)

  const valueOfAvg = (p: AggregatedPlayer) =>
    metricLane === 'dynasty' ? p.dynAvgNorm : p.rdAvgNorm

  const positionPool = useMemo(() => {
    if (!player.position) return []
    return aggregated.filter((p) => {
      if (isPick) {
        return p.position === 'PICK' || p.sleeperId.startsWith('pick:')
      }
      return (
        p.position === player.position &&
        !p.sleeperId.startsWith('pick:') &&
        p.position !== 'PICK'
      )
    })
  }, [aggregated, player.position, isPick])

  const overallPool = useMemo(
    () =>
      aggregated.filter(
        (p) => !p.sleeperId.startsWith('pick:') && p.position !== 'PICK',
      ),
    [aggregated],
  )

  const closestPosition = useMemo(
    () => nearestByValue(positionPool, player, valueOfAvg, NEIGHBORS),
    [positionPool, player, metricLane],
  )
  const closestOverall = useMemo(
    () => nearestByValue(overallPool, player, valueOfAvg, NEIGHBORS),
    [overallPool, player, metricLane],
  )

  const lane = laneLabel(metricLane)

  return (
    <div className="container mx-auto min-h-0 max-w-4xl flex-1 space-y-5 overflow-y-auto px-4 py-6">
      <nav className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <Link to="/rankings" search={{ leagueId }} className="underline">
          ← Rankings
        </Link>
        {leagueId ? (
          <>
            <span>·</span>
            <Link
              to="/league/$leagueId"
              params={{ leagueId }}
              className="underline"
            >
              League
            </Link>
            {rosterTeam ? (
              <>
                <span>·</span>
                <Link
                  to="/league/$leagueId/team/$rosterId"
                  params={{ leagueId, rosterId: String(rosterTeam.rosterId) }}
                  className="underline"
                >
                  {rosterTeam.label}
                </Link>
              </>
            ) : null}
          </>
        ) : null}
      </nav>

      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{player.name}</h1>
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          {player.position ? (
            <Badge variant="outline">{player.position}</Badge>
          ) : null}
          {player.team ? <span>{player.team}</span> : null}
          {rosterTeam ? (
            <span>
              · Rostered by{' '}
              <Link
                to="/league/$leagueId/team/$rosterId"
                params={{ leagueId: leagueId!, rosterId: String(rosterTeam.rosterId) }}
                className="underline"
              >
                {rosterTeam.label}
              </Link>
            </span>
          ) : leagueId && !isPick ? (
            <span>· Free agent</span>
          ) : null}
        </p>
      </header>

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
        <span className="text-muted-foreground border-border ml-2 border-l pl-3 text-xs">
          Norm scale: <span className="text-foreground font-medium">{normMode}</span> ·{' '}
          <Link to="/settings" className="underline">
            Settings
          </Link>
        </span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Values ({lane})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SourceCell
              label="KTC"
              value={fields.ktcValue}
              norm={fields.ktcNorm}
              rank={fields.ktcRank}
              posRank={fields.ktcPosRank}
              position={player.position}
            />
            <SourceCell
              label="FantasyCalc"
              value={fields.fcValue}
              norm={fields.fcNorm}
              rank={fields.fcRank}
              posRank={fields.fcPosRank}
              position={player.position}
            />
            <SourceCell
              label="DynastyDaddy"
              value={fields.ddValue}
              norm={fields.ddNorm}
              rank={fields.ddRank}
              posRank={fields.ddPosRank}
              position={player.position}
            />
          </div>
          <div className="mt-4 border-t pt-3 text-sm">
            <span className="text-muted-foreground">Average normalized: </span>
            <span className="font-medium tabular-nums">
              {fields.avgNorm != null ? fields.avgNorm.toLocaleString() : '—'}
            </span>
            {fields.avgRank != null ? (
              <span className="text-muted-foreground ml-3">
                · Overall #{fields.avgRank}
              </span>
            ) : null}
            {fields.avgPosRank != null && player.position ? (
              <span className="text-muted-foreground ml-3">
                · {player.position} #{fields.avgPosRank}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <ClosestList
          title={`Closest by value (${player.position ?? 'position'})`}
          rows={closestPosition}
          targetAvg={fields.avgNorm}
          leagueId={leagueId}
        />
        <ClosestList
          title="Closest by value (overall)"
          rows={closestOverall}
          targetAvg={fields.avgNorm}
          leagueId={leagueId}
        />
      </div>
    </div>
  )
}

function SourceCell({
  label,
  value,
  norm,
  rank,
  posRank,
  position,
}: {
  label: string
  value: number | null
  norm: number | null
  rank: number | null
  posRank: number | null
  position: string | null
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value != null ? value.toLocaleString() : '—'}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        norm{' '}
        <span className="text-foreground font-medium">
          {norm != null ? norm.toLocaleString() : '—'}
        </span>
        {rank != null ? <span className="ml-2">· #{rank}</span> : null}
        {posRank != null && position ? (
          <span className="ml-2">
            · {position} #{posRank}
          </span>
        ) : null}
      </p>
    </div>
  )
}

function ClosestList({
  title,
  rows,
  targetAvg,
  leagueId,
}: {
  title: string
  rows: { player: AggregatedPlayer; value: number; delta: number }[]
  targetAvg: number | null
  leagueId: string | undefined
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Not enough data to compare.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {rows.map(({ player: p, value, delta }) => (
              <li
                key={p.sleeperId}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to="/player/$sleeperId"
                    params={{ sleeperId: p.sleeperId }}
                    search={{ leagueId }}
                    className="font-medium hover:underline"
                  >
                    {p.name}
                  </Link>
                  {p.position ? (
                    <Badge
                      variant="outline"
                      className="ml-2 align-middle text-[10px]"
                    >
                      {p.position}
                    </Badge>
                  ) : null}
                  {p.team ? (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {p.team}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-baseline gap-2">
                  <span className="text-muted-foreground tabular-nums text-xs">
                    {value.toLocaleString()}
                  </span>
                  {targetAvg != null ? deltaCell(delta) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
