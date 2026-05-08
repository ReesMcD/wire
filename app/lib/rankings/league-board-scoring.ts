/**
 * Tie-aware league ranks on a closed interval [minPct, maxPct].
 * Best team maps to maxPct (e.g. 99), worst to minPct (e.g. 1).
 */
export function tieAwarePercentiles(
  values: number[],
  range: { minPct: number; maxPct: number } = { minPct: 1, maxPct: 99 },
): number[] {
  const { minPct, maxPct } = range
  const n = values.length
  if (n === 0) return []
  if (n === 1) return [maxPct]
  const indexed = values.map((t, i) => ({ t, i }))
  indexed.sort((a, b) => a.t - b.t)
  const result = new Array<number>(n).fill(0)
  const span = maxPct - minPct
  let lo = 0
  while (lo < n) {
    let hi = lo
    while (hi < n && indexed[hi].t === indexed[lo].t) hi++
    const midRank = (lo + hi - 1) / 2
    const pct = minPct + (midRank / (n - 1)) * span
    for (let k = lo; k < hi; k++) result[indexed[k].i] = pct
    lo = hi
  }
  return result
}

/**
 * Per-metric max scale to 0–9999 (same idea as player norms: best team in league = 9999).
 * `Math.round(value / max * 9999)`; all zeros if max is 0.
 */
export function normalizeLeagueMetricTo9999(values: number[]): number[] {
  const max = Math.max(0, ...values)
  if (max === 0) return values.map(() => 0)
  return values.map((v) => Math.round((v / max) * 9999))
}

/** Competition ranking: higher value = better; rank 1 = best. Tied values share the same rank. */
export function competitionRanksHighIsBest(values: number[]): number[] {
  const n = values.length
  const ranks = new Array(n).fill(1)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (values[j] > values[i]) ranks[i]++
    }
  }
  return ranks
}
