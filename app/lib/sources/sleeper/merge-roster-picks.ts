import type { SleeperTradedPick } from './types'

const TIERS = ['early', 'mid', 'late'] as const

/**
 * Sleeper roster `players` may omit future picks; `/traded_picks` lists current ownership.
 * Map each owned pick to canonical `pick:season:round:tier` ids (aligned with KTC / sync tier labels).
 */
export function mergeTradedPickIdsIntoRosterPlayerIds(
  rosterId: number,
  playerIds: string[],
  tradedPicks: SleeperTradedPick[],
): string[] {
  const out = [...playerIds]
  const existing = new Set(out)

  const owned = tradedPicks.filter((tp) => Number(tp.owner_id) === rosterId)
  for (const tp of owned) {
    const season = String(tp.season)
    const round = tp.round
    let placed = false
    for (let t = 0; t < TIERS.length * 8 && !placed; t++) {
      const tier = TIERS[t % TIERS.length]
      const id = `pick:${season}:${round}:${tier}`
      if (!existing.has(id)) {
        out.push(id)
        existing.add(id)
        placed = true
      }
    }
  }

  return out
}
