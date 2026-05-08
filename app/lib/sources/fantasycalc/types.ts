export interface FantasyCalcPlayer {
  id: number
  name: string
  mflId: string
  sleeperId: string
  position: string
  maybeBirthday: string | null
  maybeHeight: string | null
  maybeWeight: number | null
  maybeCollege: string | null
  maybeTeam: string | null
  maybeAge: number | null
  maybeYoe: number | null
  espnId: string | null
  fleaflickerId: string | null
  ffpcId: string | null
}

export interface FantasyCalcEntry {
  player: FantasyCalcPlayer
  value: number
  overallRank: number
  positionRank: number
  trend30Day: number
  maybeTier: number | null
  redraftValue: number
  combinedValue: number
}

export interface FantasyCalcConfig {
  isDynasty: boolean
  numQbs: number
  numTeams: number
  ppr: number
}
