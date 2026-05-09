import type { AggregatedPlayer } from '@/lib/rankings/player-metrics'

/** Aggregated metrics for roster slots that exist in `byId` (players and draft picks as synthetic rows). */
export function rosterAggregatedMetrics(
  playerIds: string[],
  byId: Map<string, AggregatedPlayer>,
  options: { includePicks: boolean },
): AggregatedPlayer[] {
  const out: AggregatedPlayer[] = []
  for (const id of playerIds) {
    if (!options.includePicks && id.startsWith('pick:')) continue
    const m = byId.get(id)
    if (m) out.push(m)
  }
  return out
}
