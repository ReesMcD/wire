/** One row from Dynasty Daddy / ADP Daddy CSV export */
export interface DynastyDaddyCsvRow {
  rank: number
  fullName: string
  team: string | null
  position: string | null
  /** Raw trade value from the source column (Dynasty Daddy or ADP Daddy) */
  value: number
  trend: number | null
}

export type DynastyDaddyRankingMode = 'dynasty' | 'redraft'
