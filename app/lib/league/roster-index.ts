import type { Roster } from '@/lib/db/schema'

export interface LeagueRosterIndex {
  allRostered: Set<string>
  playerToRoster: Map<string, number>
}

export function buildLeagueRosterIndex(rosters: Roster[]): LeagueRosterIndex {
  const allRostered = new Set<string>()
  const playerToRoster = new Map<string, number>()
  for (const r of rosters) {
    for (const pid of r.playerIds) {
      allRostered.add(pid)
      playerToRoster.set(pid, r.rosterId)
    }
  }
  return { allRostered, playerToRoster }
}

/** Where this row sits vs the league: draft picks are neutral; NFL assets are a roster or free agents. */
export type RowLeagueKind =
  | { kind: 'neutral' }
  | { kind: 'fa' }
  | { kind: 'roster'; rosterId: number }

export function classifyLeagueRow(sleeperId: string, index: LeagueRosterIndex): RowLeagueKind {
  if (sleeperId.startsWith('pick:')) return { kind: 'neutral' }

  const onRoster = index.playerToRoster.get(sleeperId)
  if (onRoster === undefined) return { kind: 'fa' }
  return { kind: 'roster', rosterId: onRoster }
}

/** Row matches one of the active highlight toggles (does not include draft picks). */
export function isLeagueRowHighlighted(
  kind: RowLeagueKind,
  selectedRosterIds: Set<number>,
  highlightAvailable: boolean,
): boolean {
  if (kind.kind === 'neutral') return false
  if (kind.kind === 'fa') return highlightAvailable
  return selectedRosterIds.has(kind.rosterId)
}

/**
 * When hide-unhighlighted is on, keep picks; drop rows that are not highlighted (only if at least one highlight toggle is active).
 */
export function passesLeagueVisibility(
  kind: RowLeagueKind,
  selectedRosterIds: Set<number>,
  highlightAvailable: boolean,
  hideUnhighlighted: boolean,
): boolean {
  if (!hideUnhighlighted) return true
  if (kind.kind === 'neutral') return true
  const hasHighlightTarget = selectedRosterIds.size > 0 || highlightAvailable
  if (!hasHighlightTarget) return true
  return isLeagueRowHighlighted(kind, selectedRosterIds, highlightAvailable)
}

/**
 * Split bg vs name-column border so every td gets the tint (tr backgrounds do not paint behind cells)
 * and only the sticky Player column gets the accent edge. Use !bg-* to beat spreadsheet zebra/sticky rules.
 */
const TEAM_HIGHLIGHT_PARTS = [
  { cellBg: '!bg-sky-500/12', nameBorder: '!border-l-[3px] border-sky-500' },
  { cellBg: '!bg-amber-500/12', nameBorder: '!border-l-[3px] border-amber-600' },
  { cellBg: '!bg-violet-500/12', nameBorder: '!border-l-[3px] border-violet-500' },
  { cellBg: '!bg-rose-500/12', nameBorder: '!border-l-[3px] border-rose-500' },
  { cellBg: '!bg-cyan-500/12', nameBorder: '!border-l-[3px] border-cyan-600' },
  { cellBg: '!bg-orange-500/12', nameBorder: '!border-l-[3px] border-orange-600' },
] as const

/** Stable highlight colors from league roster id ordering (not selection order). */
export function rosterHighlightParts(
  rosterId: number,
  sortedLeagueRosterIds: number[],
): { cellBg: string; nameBorder: string } {
  const idx = sortedLeagueRosterIds.indexOf(rosterId)
  const i = idx >= 0 ? idx : 0
  return TEAM_HIGHLIGHT_PARTS[i % TEAM_HIGHLIGHT_PARTS.length]
}

export const FA_HIGHLIGHT_PARTS = {
  cellBg: '!bg-emerald-500/10',
  nameBorder: '!border-l-[3px] border-emerald-600/60',
} as const
