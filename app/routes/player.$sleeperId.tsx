import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { readPlayers, readValues } from '@/server/functions/read-data'
import { getLeagueRosterSnapshot, type LeagueRosterSnapshot } from '@/server/functions/sync-sleeper'
import { aggregatePlayerValues, type AggregatedPlayer } from '@/lib/rankings/player-metrics'
import { useUiSettings } from '@/lib/stores/ui-settings'
import { explainLane, laneLabel } from '@/lib/rankings/explain'
import { cn } from '@/lib/utils'

const WINDOW_SIZE = 5

const COMPARISON_SOURCES = [
  { value: 'avg', label: 'Avg' },
  { value: 'ktc', label: 'KTC' },
  { value: 'fc', label: 'FantasyCalc' },
  { value: 'dd', label: 'DynastyDaddy' },
] as const

type ComparisonSource = (typeof COMPARISON_SOURCES)[number]['value']
type MetricLane = 'dynasty' | 'redraft'

export const Route = createFileRoute('/player/$sleeperId')({
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

type ComparisonRow = {
  player: AggregatedPlayer
  value: number
  delta: number
  isTarget: boolean
}

function laneFields(p: AggregatedPlayer, lane: MetricLane): LaneFields {
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

function sourceNorm(p: AggregatedPlayer, lane: MetricLane, source: ComparisonSource): number | null {
  const fields = laneFields(p, lane)
  if (source === 'avg') return fields.avgNorm
  if (source === 'ktc') return fields.ktcNorm
  if (source === 'fc') return fields.fcNorm
  return fields.ddNorm
}

function sourceLabel(source: ComparisonSource) {
  return COMPARISON_SOURCES.find((s) => s.value === source)?.label ?? 'Avg'
}

function isPick(p: AggregatedPlayer) {
  return p.sleeperId.startsWith('pick:') || p.position === 'PICK'
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

function comparisonWindow(
  pool: AggregatedPlayer[],
  target: AggregatedPlayer,
  lane: MetricLane,
  source: ComparisonSource,
): ComparisonRow[] {
  const targetValue = sourceNorm(target, lane, source)
  if (targetValue == null) return []

  const sorted = pool
    .map((p) => ({ player: p, value: sourceNorm(p, lane, source) }))
    .filter((r): r is { player: AggregatedPlayer; value: number } => r.value != null)
    .sort((a, b) => b.value - a.value || a.player.name.localeCompare(b.player.name))

  const existingIndex = sorted.findIndex((r) => r.player.sleeperId === target.sleeperId)
  const targetRow = { player: target, value: targetValue }
  const targetIndex =
    existingIndex >= 0
      ? existingIndex
      : (() => {
          const insertAt = sorted.findIndex((r) => r.value <= targetValue)
          const index = insertAt === -1 ? sorted.length : insertAt
          sorted.splice(index, 0, targetRow)
          return index
        })()

  const start = Math.max(0, targetIndex - WINDOW_SIZE)
  const end = Math.min(sorted.length, targetIndex + WINDOW_SIZE + 1)
  return sorted.slice(start, end).map((r) => ({
    player: r.player,
    value: r.value,
    delta: r.value - targetValue,
    isTarget: r.player.sleeperId === target.sleeperId,
  }))
}

function deltaText(delta: number) {
  if (delta === 0) return 'even'
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString()}`
}

function PlayerPage() {
  const { sleeperId } = Route.useParams()
  const { leagueId } = Route.useSearch()
  const { players, values, leagueSnapshot } = Route.useLoaderData()

  const metricLane = useUiSettings((s) => s.metricLane)
  const setMetricLane = useUiSettings((s) => s.setMetricLane)
  const normMode = useUiSettings((s) => s.normMode)
  const [positionSource, setPositionSource] = useState<ComparisonSource>('avg')
  const [overallSource, setOverallSource] = useState<ComparisonSource>('avg')
  const [pickSource, setPickSource] = useState<ComparisonSource>('avg')

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
  const playerIsPick = isPick(player)
  const rosterTeam = rosterTeamFor(player.sleeperId, leagueSnapshot)

  const positionPool = useMemo(() => {
    if (!player.position) return []
    return aggregated.filter((p) => {
      if (playerIsPick) return isPick(p)
      return p.position === player.position && !isPick(p)
    })
  }, [aggregated, player.position, playerIsPick])

  const overallPool = useMemo(() => aggregated.filter((p) => !isPick(p)), [aggregated])
  const pickPool = useMemo(() => aggregated.filter((p) => isPick(p)), [aggregated])

  const positionRows = useMemo(
    () => comparisonWindow(positionPool, player, metricLane, positionSource),
    [positionPool, player, metricLane, positionSource],
  )
  const overallRows = useMemo(
    () => comparisonWindow(overallPool, player, metricLane, overallSource),
    [overallPool, player, metricLane, overallSource],
  )
  const pickRows = useMemo(
    () => comparisonWindow(pickPool, player, metricLane, pickSource),
    [pickPool, player, metricLane, pickSource],
  )

  const lane = laneLabel(metricLane)

  return (
    <div className="container mx-auto flex min-h-0 max-w-5xl flex-1 flex-col gap-5 overflow-y-auto px-4 py-6">
      <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Link to="/rankings" search={{ leagueId }} className="underline">
          ← Rankings
        </Link>
        {leagueId ? (
          <>
            <span>·</span>
            <Link to="/league/$leagueId" params={{ leagueId }} className="underline">
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

      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{player.name}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {player.position ? <Badge variant="outline">{player.position}</Badge> : null}
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
          ) : leagueId && !playerIsPick ? (
            <span>· Free agent</span>
          ) : null}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Metric:</span>
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
        <span className="ml-2 border-l border-border pl-3 text-xs text-muted-foreground">
          Norm scale: <span className="font-medium text-foreground">{normMode}</span> ·{' '}
          <Link to="/settings" className="underline">
            Settings
          </Link>
        </span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Normalized values ({lane})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
          <div className="border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Average normalized: </span>
            <span className="font-medium tabular-nums">
              {fields.avgNorm != null ? fields.avgNorm.toLocaleString() : '—'}
            </span>
            {fields.avgRank != null ? (
              <span className="ml-3 text-muted-foreground">· Overall #{fields.avgRank}</span>
            ) : null}
            {fields.avgPosRank != null && player.position ? (
              <span className="ml-3 text-muted-foreground">
                · {player.position} #{fields.avgPosRank}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <ComparisonCard
          title={`Position window (${player.position ?? 'position'})`}
          source={positionSource}
          onSourceChange={setPositionSource}
          rows={positionRows}
          leagueId={leagueId}
        />
        <ComparisonCard
          title="Overall window"
          source={overallSource}
          onSourceChange={setOverallSource}
          rows={overallRows}
          leagueId={leagueId}
        />
        <ComparisonCard
          title="Pick value window"
          source={pickSource}
          onSourceChange={setPickSource}
          rows={pickRows}
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
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {norm != null ? norm.toLocaleString() : '—'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        raw <span className="font-medium text-foreground">{value != null ? value.toLocaleString() : '—'}</span>
        {rank != null ? <span className="ml-2">· #{rank}</span> : null}
        {posRank != null && position ? <span className="ml-2">· {position} #{posRank}</span> : null}
      </p>
    </div>
  )
}

function SourceSelect({
  value,
  onValueChange,
}: {
  value: ComparisonSource
  onValueChange: (v: ComparisonSource) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as ComparisonSource)}>
      <SelectTrigger className="h-8 w-[8.75rem] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {COMPARISON_SOURCES.map((source) => (
          <SelectItem key={source.value} value={source.value}>
            {source.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ComparisonCard({
  title,
  source,
  onSourceChange,
  rows,
  leagueId,
}: {
  title: string
  source: ComparisonSource
  onSourceChange: (v: ComparisonSource) => void
  rows: ComparisonRow[]
  leagueId: string | undefined
}) {
  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <SourceSelect value={source} onValueChange={onSourceChange} />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough normalized {sourceLabel(source)} data to compare.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {rows.map((row) => (
              <li
                key={`${row.player.sleeperId}-${row.isTarget ? 'target' : 'neighbor'}`}
                className={cn(
                  'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md border border-transparent px-2 py-1.5',
                  row.isTarget ? 'border-primary/40 bg-primary/10' : 'hover:bg-muted/40',
                )}
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to="/player/$sleeperId"
                    params={{ sleeperId: row.player.sleeperId }}
                    search={{ leagueId }}
                    className={cn('font-medium hover:underline', row.isTarget && 'text-foreground')}
                  >
                    {row.player.name}
                  </Link>
                  {row.player.position ? (
                    <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                      {row.player.position}
                    </Badge>
                  ) : null}
                  {row.isTarget ? <Badge className="ml-2 align-middle text-[10px]">Current</Badge> : null}
                  {row.player.team ? <span className="ml-2 text-xs text-muted-foreground">{row.player.team}</span> : null}
                </div>
                <div className="flex shrink-0 items-baseline gap-2">
                  <span className="tabular-nums text-muted-foreground">{row.value.toLocaleString()}</span>
                  <span className="tabular-nums text-xs text-muted-foreground">{deltaText(row.delta)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
