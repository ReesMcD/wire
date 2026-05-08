export interface PlayerMatchInput {
  name?: string
  firstName?: string
  lastName?: string
  team?: string | null
  position?: string | null
  sleeperId?: string
}

export type MatchConfidence = 'exact' | 'high' | 'low' | 'unresolved'
export type MatchMethod = 'sleeperId' | 'compositeKey' | 'fuzzy'

export interface PlayerMatchResult {
  sleeperId: string | null
  confidence: MatchConfidence
  matchedVia: MatchMethod | null
}
