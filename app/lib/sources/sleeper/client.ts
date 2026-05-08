import type {
  SleeperApiLeague,
  SleeperApiPlayer,
  SleeperApiRoster,
  SleeperApiUser,
} from './types'

const BASE_URL = 'https://api.sleeper.app/v1'

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export async function fetchAllPlayers(): Promise<Record<string, SleeperApiPlayer>> {
  return fetchJson<Record<string, SleeperApiPlayer>>(`${BASE_URL}/players/nfl`)
}

export async function fetchLeague(leagueId: string): Promise<SleeperApiLeague> {
  return fetchJson<SleeperApiLeague>(`${BASE_URL}/league/${leagueId}`)
}

export async function fetchLeagueUsers(leagueId: string): Promise<SleeperApiUser[]> {
  return fetchJson<SleeperApiUser[]>(`${BASE_URL}/league/${leagueId}/users`)
}

export async function fetchLeagueRosters(leagueId: string): Promise<SleeperApiRoster[]> {
  return fetchJson<SleeperApiRoster[]>(`${BASE_URL}/league/${leagueId}/rosters`)
}

export async function fetchNflState(): Promise<{ season: string; week: number }> {
  return fetchJson<{ season: string; week: number }>(`${BASE_URL}/state/nfl`)
}
