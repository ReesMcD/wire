import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { readPlayers, readValues } from '@/server/functions/read-data'
import { getLeagueRosterSnapshot } from '@/server/functions/sync-sleeper'
import { LeagueRouteProvider } from '@/lib/league-route-context'
import {
  LEAGUE_FETCHED_AT_STORAGE_KEY,
  LEAGUE_ID_STORAGE_KEY,
  notifyLeagueStorageChanged,
} from '@/lib/league-storage'

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

  useEffect(() => {
    try {
      localStorage.setItem(LEAGUE_ID_STORAGE_KEY, data.leagueId)
      localStorage.setItem(LEAGUE_FETCHED_AT_STORAGE_KEY, data.leagueSnapshot.fetchedAt)
      notifyLeagueStorageChanged()
    } catch {
      /* ignore */
    }
  }, [data.leagueId, data.leagueSnapshot.fetchedAt])

  return (
    <LeagueRouteProvider value={data}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </LeagueRouteProvider>
  )
}
