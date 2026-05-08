export interface NormalizedPlayerValue {
  sleeperId?: string
  name: string
  team: string | null
  position: string | null
  value: number
  overallRank: number | null
  positionRank: number | null
  trend: number | null
  tier: number | null
}

export interface DataSourceConfig {
  isDynasty?: boolean
  /** KTC: dynasty vs redraft ranking pages */
  rankingMode?: 'dynasty' | 'redraft'
  numQbs?: number
  numTeams?: number
  ppr?: number
}

export interface DataSourceProvider<TRaw = unknown> {
  readonly id: string
  readonly name: string
  readonly type: 'values' | 'league'

  fetch(config?: DataSourceConfig): Promise<TRaw>
  normalize(raw: TRaw): NormalizedPlayerValue[]
}

export interface LeagueDataSourceProvider<TRaw = unknown> {
  readonly id: string
  readonly name: string
  readonly type: 'league'

  fetchLeague(leagueId: string): Promise<TRaw>
}
