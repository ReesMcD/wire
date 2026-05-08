import type { AggregatedPlayer } from '@/lib/rankings/player-metrics'
import { avgLane, type DepthTier, type MetricLane } from '@/lib/rankings/league-board-power-input'

/** Value-optimal “superflex-style” lineup: 2 QB, 3 WR, 3 RB, 1 TE. */
export function selectValueStarters(metrics: AggregatedPlayer[], lane: MetricLane): AggregatedPlayer[] {
  const buckets = {
    QB: [] as AggregatedPlayer[],
    RB: [] as AggregatedPlayer[],
    WR: [] as AggregatedPlayer[],
    TE: [] as AggregatedPlayer[],
  }
  for (const p of metrics) {
    const pos = p.position
    if (pos === 'QB') buckets.QB.push(p)
    else if (pos === 'RB') buckets.RB.push(p)
    else if (pos === 'WR') buckets.WR.push(p)
    else if (pos === 'TE') buckets.TE.push(p)
  }
  const sortDesc = (a: AggregatedPlayer, b: AggregatedPlayer) => {
    const av = avgLane(a, lane)
    const bv = avgLane(b, lane)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return bv - av
  }
  buckets.QB.sort(sortDesc)
  buckets.RB.sort(sortDesc)
  buckets.WR.sort(sortDesc)
  buckets.TE.sort(sortDesc)

  const starters: AggregatedPlayer[] = []
  starters.push(...buckets.QB.slice(0, 2))
  starters.push(...buckets.WR.slice(0, 3))
  starters.push(...buckets.RB.slice(0, 3))
  starters.push(...buckets.TE.slice(0, 1))
  return starters
}

/**
 * QB/TE: starter + 1 backup slot; WR/RB: starter + 2 backup slots; rest bench.
 * Non QB/RB/WR/TE → bench.
 */
export function depthTierByPlayerId(metrics: AggregatedPlayer[], lane: MetricLane): Map<string, DepthTier> {
  const map = new Map<string, DepthTier>()

  const buckets = {
    QB: [] as AggregatedPlayer[],
    RB: [] as AggregatedPlayer[],
    WR: [] as AggregatedPlayer[],
    TE: [] as AggregatedPlayer[],
  }
  for (const p of metrics) {
    const pos = p.position
    if (pos === 'QB') buckets.QB.push(p)
    else if (pos === 'RB') buckets.RB.push(p)
    else if (pos === 'WR') buckets.WR.push(p)
    else if (pos === 'TE') buckets.TE.push(p)
  }
  const sortDesc = (a: AggregatedPlayer, b: AggregatedPlayer) => {
    const av = avgLane(a, lane)
    const bv = avgLane(b, lane)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return bv - av
  }
  buckets.QB.sort(sortDesc)
  buckets.RB.sort(sortDesc)
  buckets.WR.sort(sortDesc)
  buckets.TE.sort(sortDesc)

  const setTier = (arr: AggregatedPlayer[], starterCount: number, backupCount: number) => {
    for (let i = 0; i < arr.length; i++) {
      let tier: DepthTier
      if (i < starterCount) tier = 'starter'
      else if (i < starterCount + backupCount) tier = 'backup'
      else tier = 'bench'
      map.set(arr[i].sleeperId, tier)
    }
  }

  setTier(buckets.QB, 2, 1)
  setTier(buckets.RB, 3, 2)
  setTier(buckets.WR, 3, 2)
  setTier(buckets.TE, 1, 1)

  for (const p of metrics) {
    if (!map.has(p.sleeperId)) map.set(p.sleeperId, 'bench')
  }
  return map
}
