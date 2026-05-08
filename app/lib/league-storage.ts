/** Persisted league id for Rankings / Sync / header refresh (shared). */
export const LEAGUE_ID_STORAGE_KEY = 'fantasy-league-id'

/** ISO timestamp when league rosters were last fetched successfully. */
export const LEAGUE_FETCHED_AT_STORAGE_KEY = 'fantasy-league-fetched-at'

/** Same-tab updates do not fire `storage`; dispatch this after writes. */
export const LEAGUE_STORAGE_EVENT = 'fantasy-league-storage'

export function notifyLeagueStorageChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(LEAGUE_STORAGE_EVENT))
}
