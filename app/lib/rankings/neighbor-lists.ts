import type { AggregatedPlayer } from '@/lib/rankings/player-metrics'
import type { MetricLane } from '@/lib/rankings/league-board-power-input'

export function isPickEntity(p: AggregatedPlayer): boolean {
  return p.sleeperId.startsWith('pick:') || p.position === 'PICK'
}

function laneAvgNorm(p: AggregatedPlayer, lane: MetricLane): number | null {
  return lane === 'dynasty' ? p.dynAvgNorm : p.rdAvgNorm
}

/** Descending sort by score; nulls last; tie-break by name then sleeperId. */
export function sortByLaneAvgNormDesc(rows: AggregatedPlayer[], lane: MetricLane): AggregatedPlayer[] {
  return [...rows].sort((a, b) => {
    const av = laneAvgNorm(a, lane)
    const bv = laneAvgNorm(b, lane)
    if (av == null && bv == null) return a.sleeperId.localeCompare(b.sleeperId)
    if (av == null) return 1
    if (bv == null) return -1
    if (bv !== av) return bv - av
    if (a.name !== b.name) return a.name.localeCompare(b.name)
    return a.sleeperId.localeCompare(b.sleeperId)
  })
}

export function filterPickPool(rows: AggregatedPlayer[]): AggregatedPlayer[] {
  return rows.filter(isPickEntity)
}

export function filterNonPickPool(rows: AggregatedPlayer[]): AggregatedPlayer[] {
  return rows.filter((p) => !isPickEntity(p))
}

/**
 * Non-picks, optionally including pick rows in the pool when `similarityIncludePicks` is true
 * (sorted by avg norm for the lane).
 */
export function filterOverallNeighborPool(
  rows: AggregatedPlayer[],
  lane: MetricLane,
  similarityIncludePicks: boolean,
): AggregatedPlayer[] {
  if (similarityIncludePicks) return [...rows]
  return filterNonPickPool(rows)
}

export function filterSamePositionPool(
  rows: AggregatedPlayer[],
  position: string | null,
  lane: MetricLane,
  similarityIncludePicks: boolean,
): AggregatedPlayer[] {
  if (!position) return []
  const base = rows.filter((p) => p.position === position)
  if (similarityIncludePicks) return base
  return base.filter((p) => !isPickEntity(p))
}

export type NeighborSlice<T> = { above: T[]; below: T[] }

/** `above` = up to `aboveCount` rows better than target (earlier in desc-sorted list); `below` = worse rows. */
export function sliceNeighborsDesc<T extends { sleeperId: string }>(
  sorted: T[],
  targetId: string,
  aboveCount: number,
  belowCount: number,
): NeighborSlice<T> {
  const idx = sorted.findIndex((r) => r.sleeperId === targetId)
  if (idx < 0) return { above: [], below: [] }
  const above = sorted.slice(Math.max(0, idx - aboveCount), idx)
  const below = sorted.slice(idx + 1, idx + 1 + belowCount)
  return { above, below }
}

export function neighborsClosestPicks(
  all: AggregatedPlayer[],
  lane: MetricLane,
  target: AggregatedPlayer,
  aboveCount = 5,
  belowCount = 5,
): NeighborSlice<AggregatedPlayer> {
  const pool = sortByLaneAvgNormDesc(filterPickPool(all), lane)
  return sliceNeighborsDesc(pool, target.sleeperId, aboveCount, belowCount)
}

export function neighborsClosestOverall(
  all: AggregatedPlayer[],
  lane: MetricLane,
  target: AggregatedPlayer,
  similarityIncludePicks: boolean,
  aboveCount = 5,
  belowCount = 5,
): NeighborSlice<AggregatedPlayer> {
  const pool = sortByLaneAvgNormDesc(filterOverallNeighborPool(all, lane, similarityIncludePicks), lane)
  return sliceNeighborsDesc(pool, target.sleeperId, aboveCount, belowCount)
}

export function neighborsClosestSamePosition(
  all: AggregatedPlayer[],
  lane: MetricLane,
  target: AggregatedPlayer,
  similarityIncludePicks: boolean,
  aboveCount = 5,
  belowCount = 5,
): NeighborSlice<AggregatedPlayer> {
  if (isPickEntity(target)) return { above: [], below: [] }
  const pool = sortByLaneAvgNormDesc(
    filterSamePositionPool(all, target.position, lane, similarityIncludePicks),
    lane,
  )
  return sliceNeighborsDesc(pool, target.sleeperId, aboveCount, belowCount)
}

/** e.g. WR23, TE5; pick pool uses PICK7 */
export function formatPosRankLabel(position: string | null, rank: number | null): string {
  if (rank == null) return '—'
  if (!position || position === 'PICK') return `PICK${rank}`
  return `${position}${rank}`
}
