import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  fetchAllPlayers,
  fetchLeague,
  fetchLeagueRosters,
  fetchLeagueTradedPicks,
  fetchLeagueUsers,
} from '@/lib/sources/sleeper/client'
import { mergeTradedPickIdsIntoRosterPlayerIds } from '@/lib/sources/sleeper/merge-roster-picks'
import { writePlayers, updateSyncMetadata } from './write-data'
import type { SleeperApiPlayer, SleeperTradedPick } from '@/lib/sources/sleeper/types'
import type { League, LeagueUser, Roster, SleeperPlayer } from '@/lib/db/schema'

async function normalizeLeagueBundle(leagueId: string) {
  const [league, users, rosters, tradedPicks] = await Promise.all([
    fetchLeague(leagueId),
    fetchLeagueUsers(leagueId),
    fetchLeagueRosters(leagueId),
    fetchLeagueTradedPicks(leagueId).catch((): SleeperTradedPick[] => []),
  ])

  const normalizedLeague: League = {
    leagueId: league.league_id,
    name: league.name,
    season: league.season,
    totalRosters: league.total_rosters,
    scoringSettings: league.scoring_settings,
    rosterPositions: league.roster_positions,
    status: league.status,
  }

  const normalizedUsers: LeagueUser[] = users.map((u) => ({
    odataKey: `${leagueId}:${u.user_id}`,
    userId: u.user_id,
    leagueId,
    displayName: u.display_name,
    teamName: u.metadata?.team_name ?? null,
    avatar: u.avatar,
    isOwner: u.is_owner ?? false,
  }))

  const normalizedRosters: Roster[] = rosters.map((r) => ({
    odataKey: `${leagueId}:${r.roster_id}`,
    rosterId: r.roster_id,
    leagueId,
    ownerId: r.owner_id,
    playerIds: mergeTradedPickIdsIntoRosterPlayerIds(r.roster_id, r.players ?? [], tradedPicks),
    starters: r.starters ?? [],
    wins: r.settings.wins,
    losses: r.settings.losses,
    ties: r.settings.ties,
  }))

  return {
    league: normalizedLeague,
    users: normalizedUsers,
    rosters: normalizedRosters,
  }
}

export type LeagueRosterSnapshot = Awaited<ReturnType<typeof normalizeLeagueBundle>> & {
  fetchedAt: string
}

export const syncSleeperPlayers = createServerFn({ method: 'GET' }).handler(
  async () => {
    console.log('[Sleeper] Fetching all players...')
    const raw = await fetchAllPlayers()
    const players: SleeperPlayer[] = Object.values(raw)
      .filter((p): p is SleeperApiPlayer => p.sport === 'nfl' || p.position !== null)
      .map((p) => ({
        playerId: p.player_id,
        firstName: p.first_name,
        lastName: p.last_name,
        team: p.team,
        position: p.position,
        age: p.age,
        yearsExp: p.years_exp,
        searchFullName: p.search_full_name,
        status: p.status,
      }))

    console.log(`[Sleeper] Fetched ${players.length} players, writing to disk...`)
    await writePlayers(players)
    await updateSyncMetadata('sleeper_players', {
      lastSyncedAt: new Date().toISOString(),
      status: 'success',
      error: null,
      recordCount: players.length,
    })

    return players
  },
)

export const syncSleeperLeague = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ leagueId: z.string().min(1) }))
  .handler(async ({ data }) => {
    return normalizeLeagueBundle(data.leagueId)
  })

/** Live Sleeper league users + rosters; includes `fetchedAt` for UI. */
export const getLeagueRosterSnapshot = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ leagueId: z.string().min(1) }))
  .handler(async ({ data }): Promise<LeagueRosterSnapshot> => {
    const bundle = await normalizeLeagueBundle(data.leagueId)
    return {
      ...bundle,
      fetchedAt: new Date().toISOString(),
    }
  })
