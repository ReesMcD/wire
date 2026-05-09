export interface SleeperApiPlayer {
  player_id: string
  first_name: string
  last_name: string
  team: string | null
  position: string | null
  fantasy_positions: string[] | null
  age: number | null
  years_exp: number | null
  search_full_name: string
  status: string | null
  sport: string
}

export interface SleeperApiLeague {
  league_id: string
  name: string
  season: string
  total_rosters: number
  status: string
  scoring_settings: Record<string, number>
  roster_positions: string[]
  settings: Record<string, unknown>
}

export interface SleeperApiUser {
  user_id: string
  username: string
  display_name: string
  avatar: string | null
  metadata: {
    team_name?: string
  }
  is_owner?: boolean
}

export interface SleeperApiRoster {
  roster_id: number
  owner_id: string | null
  league_id: string
  players: string[] | null
  starters: string[] | null
  settings: {
    wins: number
    losses: number
    ties: number
    fpts?: number
    fpts_decimal?: number
    [key: string]: unknown
  }
}

/** Future / traded draft picks; `owner_id` is current roster id holding the pick. */
export interface SleeperTradedPick {
  season: string
  round: number
  roster_id: number
  owner_id: number
  previous_owner_id?: number
}
