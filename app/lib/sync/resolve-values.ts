import { PlayerMatcher } from '@/lib/players/matcher'
import type { SleeperPlayer, PlayerValue, UnresolvedPlayer } from '@/lib/db/schema'
import type { NormalizedPlayerValue } from '@/lib/sources/types'

export interface ResolveResult {
  resolved: PlayerValue[]
  unresolved: UnresolvedPlayer[]
}

/** Prefer better list position (lower overallRank), then higher raw value, then first row. */
function pickBetterPlayerValue(a: PlayerValue, b: PlayerValue): PlayerValue {
  const rankA = a.overallRank ?? Number.POSITIVE_INFINITY
  const rankB = b.overallRank ?? Number.POSITIVE_INFINITY
  if (rankA !== rankB) return rankA < rankB ? a : b
  if (a.value !== b.value) return a.value > b.value ? a : b
  return a
}

/** Collapse duplicate `id` (same sleeper + source) from upstream CSV / matcher collisions. */
export function dedupePlayerValuesById(rows: PlayerValue[]): PlayerValue[] {
  const map = new Map<string, PlayerValue>()
  for (const row of rows) {
    const existing = map.get(row.id)
    if (!existing) {
      map.set(row.id, row)
      continue
    }
    map.set(row.id, pickBetterPlayerValue(existing, row))
  }
  return [...map.values()]
}

export function resolveValues(
  sourceId: string,
  values: NormalizedPlayerValue[],
  players: SleeperPlayer[],
): ResolveResult {
  const matcher = new PlayerMatcher(players)
  const now = new Date().toISOString()
  const resolved: PlayerValue[] = []
  const unresolved: UnresolvedPlayer[] = []

  for (const val of values) {
    const isPick = val.position === 'PICK' && val.sleeperId?.startsWith('pick:')

    if (isPick && val.sleeperId) {
      resolved.push({
        id: `${val.sleeperId}:${sourceId}`,
        sleeperId: val.sleeperId,
        sourceId,
        value: val.value,
        normalizedValue: 0,
        normalizedValueQm: null,
        overallRank: val.overallRank,
        positionRank: val.positionRank,
        trend: val.trend,
        tierAvg: null,
        tierFc: null,
        tierKtc: null,
        tierDd: null,
        updatedAt: now,
      })
      continue
    }

    const matchResult = matcher.match({
      sleeperId: val.sleeperId,
      name: val.name,
      team: val.team ?? undefined,
      position: val.position ?? undefined,
    })

    if (matchResult.sleeperId) {
      resolved.push({
        id: `${matchResult.sleeperId}:${sourceId}`,
        sleeperId: matchResult.sleeperId,
        sourceId,
        value: val.value,
        normalizedValue: 0,
        normalizedValueQm: null,
        overallRank: val.overallRank,
        positionRank: val.positionRank,
        trend: val.trend,
        tierAvg: null,
        tierFc: null,
        tierKtc: null,
        tierDd: null,
        updatedAt: now,
      })
    } else {
      unresolved.push({
        id: `${sourceId}:${val.name}:${val.team ?? 'FA'}`,
        sourceId,
        rawName: val.name,
        team: val.team,
        position: val.position,
        value: val.value,
        fetchedAt: now,
      })
    }
  }

  const dedupedResolved = dedupePlayerValuesById(resolved)

  const maxValue = dedupedResolved.reduce((max, v) => Math.max(max, v.value), 0)
  if (maxValue > 0) {
    for (const r of dedupedResolved) {
      r.normalizedValue = Math.round((r.value / maxValue) * 9999)
    }
  }

  return { resolved: dedupedResolved, unresolved }
}
