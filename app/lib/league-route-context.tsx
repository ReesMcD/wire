import { createContext, useContext, type ReactNode } from 'react'
import type { PlayerValue, SleeperPlayer } from '@/lib/db/schema'
import type { LeagueRosterSnapshot } from '@/server/functions/sync-sleeper'

export type LeagueRouteLoaderData = {
  leagueId: string
  players: SleeperPlayer[]
  values: PlayerValue[]
  leagueSnapshot: LeagueRosterSnapshot
}

const LeagueRouteContext = createContext<LeagueRouteLoaderData | null>(null)

export function LeagueRouteProvider({
  value,
  children,
}: {
  value: LeagueRouteLoaderData
  children: ReactNode
}) {
  return <LeagueRouteContext.Provider value={value}>{children}</LeagueRouteContext.Provider>
}

export function useLeagueRoute(): LeagueRouteLoaderData {
  const v = useContext(LeagueRouteContext)
  if (!v) throw new Error('useLeagueRoute must be used under /league/$leagueId')
  return v
}
