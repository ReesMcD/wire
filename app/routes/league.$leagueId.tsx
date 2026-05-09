import { createFileRoute, Outlet } from '@tanstack/react-router'
import { readPlayers, readValues } from '@/server/functions/read-data'
import { getLeagueRosterSnapshot } from '@/server/functions/sync-sleeper'
import { LeagueRouteProvider } from '@/lib/league-route-context'
import { LeagueChrome } from '@/components/league/league-chrome'

export const Route = createFileRoute('/league/$leagueId')({
  loader: async ({ params }) => {
    const [players, values, leagueSnapshot] = await Promise.all([
      readPlayers(),
      readValues(),
      getLeagueRosterSnapshot({ data: { leagueId: params.leagueId } }),
    ])
    return {
      leagueId: params.leagueId,
      players,
      values,
      leagueSnapshot,
    }
  },
  component: LeagueLayout,
})

function LeagueLayout() {
  const data = Route.useLoaderData()
  return (
    <LeagueRouteProvider value={data}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <LeagueChrome />
        <Outlet />
      </div>
    </LeagueRouteProvider>
  )
}
