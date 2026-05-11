import type { AggregatedPlayer } from '@/lib/rankings/player-metrics'

export type MetricLane = 'dynasty' | 'redraft'

export function avgLane(p: AggregatedPlayer, lane: MetricLane): number | null {
  return lane === 'dynasty' ? p.dynAvgNorm : p.rdAvgNorm
}

export function ktcLane(p: AggregatedPlayer, lane: MetricLane): number | null {
  return lane === 'dynasty' ? p.dynKtcNorm : p.rdKtcNorm
}

export function fcLane(p: AggregatedPlayer, lane: MetricLane): number | null {
  return lane === 'dynasty' ? p.dynFcNorm : p.rdFcNorm
}

export function ddLane(p: AggregatedPlayer, lane: MetricLane): number | null {
  return lane === 'dynasty' ? p.dynDdNorm : p.rdDdNorm
}

/** Which normalized source drives a single “display norm” cell (e.g. league roster list). */
export type NormLaneSource = 'avg' | 'ktc' | 'fc' | 'dd'

export function normByLaneSource(p: AggregatedPlayer, lane: MetricLane, source: NormLaneSource): number | null {
  switch (source) {
    case 'avg':
      return avgLane(p, lane)
    case 'ktc':
      return ktcLane(p, lane)
    case 'fc':
      return fcLane(p, lane)
    case 'dd':
      return ddLane(p, lane)
  }
}

/**
 * Scalar fed into league-wide “Power” percentiles. Default: sum of avg norms in the pool
 * (full roster or value-optimal starters, depending on caller). Replace with weighted starters,
 * rookie multipliers, etc., without changing percentile plumbing.
 */
export function defaultPowerInput(metrics: AggregatedPlayer[], lane: MetricLane): number {
  return metrics.reduce((s, p) => s + (avgLane(p, lane) ?? 0), 0)
}

export type DepthTier = 'starter' | 'backup' | 'bench'

export const DEFAULT_DEPTH_WEIGHTS: Record<DepthTier, number> = {
  starter: 1,
  backup: 0.35,
  bench: 0.12,
}

export function weightedDepthPowerInput(
  pool: AggregatedPlayer[],
  lane: MetricLane,
  tierById: Map<string, DepthTier>,
  weights: Record<DepthTier, number>,
): number {
  let s = 0
  for (const p of pool) {
    const tier = tierById.get(p.sleeperId) ?? 'bench'
    const w = weights[tier] ?? 0
    s += w * (avgLane(p, lane) ?? 0)
  }
  return s
}
