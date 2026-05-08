export interface KtcPickData {
  year: number
  round: number
  tier: 'early' | 'mid' | 'late'
}

export interface KtcRawPlayer {
  playerName: string
  position: string
  team: string | null
  value: number
  overallRank: number
  positionRank: number
  trend: number | null
  tier: number | null
  pickData: KtcPickData | null
}

export interface KtcConfig {
  format: '1qb' | '2qb'
  tep: number
}
