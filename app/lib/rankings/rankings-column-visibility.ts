import type { VisibilityState } from '@tanstack/react-table'

/** localStorage key — shared by Rankings and Team roster tables. */
export const RANKINGS_COLUMN_VISIBILITY_STORAGE_KEY = 'rankings-column-visibility'

export const RANKINGS_GROUP_COLUMN_IDS = [
  'dynasty_avg',
  'dynasty_ktc',
  'dynasty_dd',
  'dynasty_fc',
  'redraft_avg',
  'redraft_ktc',
  'redraft_dd',
  'redraft_fc',
] as const

export type RankingsGroupColumnId = (typeof RANKINGS_GROUP_COLUMN_IDS)[number]

/** Leaf column ids for TanStack visibility (raw value columns). */
export const RANKINGS_RAW_LEAF_IDS = [
  'dynasty_ktc_raw',
  'dynasty_dd_raw',
  'dynasty_fc_raw',
  'redraft_ktc_raw',
  'redraft_dd_raw',
  'redraft_fc_raw',
] as const

/** Per-source tier columns only (not avg Tier Σ). */
export const RANKINGS_SOURCE_TIER_LEAF_IDS = [
  'dynasty_ktc_tier',
  'dynasty_dd_tier',
  'dynasty_fc_tier',
  'redraft_ktc_tier',
  'redraft_dd_tier',
  'redraft_fc_tier',
] as const

export function readRankingsGroupVisibilityFromStorage(): Partial<Record<RankingsGroupColumnId, boolean>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(RANKINGS_COLUMN_VISIBILITY_STORAGE_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as Record<string, unknown>
    const next: Partial<Record<RankingsGroupColumnId, boolean>> = {}
    for (const k of RANKINGS_GROUP_COLUMN_IDS) {
      if (typeof j[k] === 'boolean') next[k] = j[k] as boolean
    }
    if (Object.keys(next).length === 0) {
      if (typeof j.dynasty === 'boolean') {
        const on = j.dynasty as boolean
        next.dynasty_ktc = on
        next.dynasty_dd = on
        next.dynasty_fc = on
        next.dynasty_avg = on
      }
      if (typeof j.redraft === 'boolean') {
        const on = j.redraft as boolean
        next.redraft_ktc = on
        next.redraft_dd = on
        next.redraft_fc = on
        next.redraft_avg = on
      }
    }
    return next
  } catch {
    return {}
  }
}

export function writeRankingsGroupVisibilityToStorage(vis: VisibilityState) {
  if (typeof window === 'undefined') return
  try {
    const payload: Record<string, boolean> = {}
    for (const id of RANKINGS_GROUP_COLUMN_IDS) {
      payload[id] = vis[id] !== false
    }
    localStorage.setItem(RANKINGS_COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function mergeRankingsTableColumnVisibility(
  groupVis: VisibilityState,
  hideRawValues: boolean,
  hideSourceTierColumns: boolean,
): VisibilityState {
  const out: VisibilityState = { ...groupVis }
  if (hideRawValues) {
    for (const id of RANKINGS_RAW_LEAF_IDS) out[id] = false
  }
  if (hideSourceTierColumns) {
    for (const id of RANKINGS_SOURCE_TIER_LEAF_IDS) out[id] = false
  }
  return out
}
