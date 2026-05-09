import type { PlayerValue, SleeperPlayer } from '@/lib/db/schema'
import {
  SOURCE_FC_DYNASTY,
  SOURCE_FC_REDRAFT,
  SOURCE_KTC_DYNASTY,
  SOURCE_KTC_REDRAFT,
  SOURCE_DD_DYNASTY,
  SOURCE_DD_REDRAFT,
  LEGACY_FC,
  LEGACY_KTC,
} from '@/lib/sync/tiering'

export type NormMode = 'max' | 'quantile'

export type SourcesMap = Partial<Record<string, PlayerValue>>

export function pickNorm(pv: PlayerValue | undefined, mode: NormMode): number | null {
  if (!pv) return null
  if (mode === 'quantile') {
    if (pv.normalizedValueQm != null) return pv.normalizedValueQm
    return pv.normalizedValue ?? null
  }
  return pv.normalizedValue ?? null
}

export function avgNormMode(
  a: PlayerValue | undefined,
  b: PlayerValue | undefined,
  mode: NormMode,
): number | null {
  const an = pickNorm(a, mode)
  const bn = pickNorm(b, mode)
  if (an != null && bn != null) return Math.round((an + bn) / 2)
  return an ?? bn ?? null
}

function avgNormMulti(mode: NormMode, rows: (PlayerValue | undefined)[]): number | null {
  const norms = rows.map((r) => pickNorm(r, mode)).filter((n): n is number => n != null)
  if (norms.length === 0) return null
  return Math.round(norms.reduce((a, b) => a + b, 0) / norms.length)
}

function fcDyn(m: SourcesMap) {
  return m[SOURCE_FC_DYNASTY] ?? m[LEGACY_FC]
}
function ktcDyn(m: SourcesMap) {
  return m[SOURCE_KTC_DYNASTY] ?? m[LEGACY_KTC]
}
function ddDyn(m: SourcesMap) {
  return m[SOURCE_DD_DYNASTY]
}
function fcRd(m: SourcesMap) {
  return m[SOURCE_FC_REDRAFT]
}
function ktcRd(m: SourcesMap) {
  return m[SOURCE_KTC_REDRAFT]
}
function ddRd(m: SourcesMap) {
  return m[SOURCE_DD_REDRAFT]
}

export interface AggregatedPlayer {
  sleeperId: string
  name: string
  team: string | null
  position: string | null
  dynTierAvg: number | null
  dynTierFc: number | null
  dynTierKtc: number | null
  dynTierDd: number | null
  dynFcValue: number | null
  dynFcNorm: number | null
  dynFcRank: number | null
  dynFcPosRank: number | null
  dynKtcValue: number | null
  dynKtcNorm: number | null
  dynKtcRank: number | null
  dynKtcPosRank: number | null
  dynDdValue: number | null
  dynDdNorm: number | null
  dynDdRank: number | null
  dynDdPosRank: number | null
  dynAvgNorm: number | null
  dynAvgRank: number | null
  dynAvgPosRank: number | null
  rdTierAvg: number | null
  rdTierFc: number | null
  rdTierKtc: number | null
  rdTierDd: number | null
  rdFcValue: number | null
  rdFcNorm: number | null
  rdFcRank: number | null
  rdFcPosRank: number | null
  rdKtcValue: number | null
  rdKtcNorm: number | null
  rdKtcRank: number | null
  rdKtcPosRank: number | null
  rdDdValue: number | null
  rdDdNorm: number | null
  rdDdRank: number | null
  rdDdPosRank: number | null
  rdAvgNorm: number | null
  rdAvgRank: number | null
  rdAvgPosRank: number | null
  dynDeltaNormFcVsKtc: number | null
  dynDeltaNormDdVsKtc: number | null
  rdDeltaNormFcVsKtc: number | null
  rdDeltaNormDdVsKtc: number | null
}

type PosRankField = keyof Pick<
  AggregatedPlayer,
  | 'dynKtcPosRank'
  | 'dynFcPosRank'
  | 'dynDdPosRank'
  | 'rdKtcPosRank'
  | 'rdFcPosRank'
  | 'rdDdPosRank'
  | 'dynAvgPosRank'
  | 'rdAvgPosRank'
>

type OverallRankField = keyof Pick<AggregatedPlayer, 'dynAvgRank' | 'rdAvgRank'>

type ValueField = keyof Pick<
  AggregatedPlayer,
  | 'dynKtcValue'
  | 'dynFcValue'
  | 'dynDdValue'
  | 'rdKtcValue'
  | 'rdFcValue'
  | 'rdDdValue'
  | 'dynAvgNorm'
  | 'rdAvgNorm'
>

/**
 * Assigns 1..N positional rank to non-pick rows by `valueField` desc within `position`.
 * Picks (PICK / pick:* sleeperId) are excluded; rows missing `valueField` keep `null`.
 */
function stampPositionalRank(
  rows: AggregatedPlayer[],
  valueField: ValueField,
  rankField: PosRankField,
): void {
  const byPos = new Map<string, AggregatedPlayer[]>()
  for (const r of rows) {
    if (r.sleeperId.startsWith('pick:')) continue
    if (r.position === 'PICK') continue
    if (!r.position) continue
    if (r[valueField] == null) continue
    const list = byPos.get(r.position) ?? []
    list.push(r)
    byPos.set(r.position, list)
  }
  for (const list of byPos.values()) {
    list.sort((a, b) => {
      const av = a[valueField] ?? Number.NEGATIVE_INFINITY
      const bv = b[valueField] ?? Number.NEGATIVE_INFINITY
      if (bv !== av) return bv - av
      return a.name.localeCompare(b.name)
    })
    list.forEach((r, i) => {
      r[rankField] = i + 1
    })
  }
}

/**
 * Assigns 1..N overall rank to non-pick rows by `valueField` desc.
 */
function stampOverallRank(
  rows: AggregatedPlayer[],
  valueField: ValueField,
  rankField: OverallRankField,
): void {
  const list = rows.filter(
    (r) => !r.sleeperId.startsWith('pick:') && r.position !== 'PICK' && r[valueField] != null,
  )
  list.sort((a, b) => {
    const av = a[valueField] ?? Number.NEGATIVE_INFINITY
    const bv = b[valueField] ?? Number.NEGATIVE_INFINITY
    if (bv !== av) return bv - av
    return a.name.localeCompare(b.name)
  })
  list.forEach((r, i) => {
    r[rankField] = i + 1
  })
}

/** Among draft picks only, rank by `valueField` desc → 1..N (e.g. PICK1 = best pick by that metric). */
function stampPickPoolRank(
  rows: AggregatedPlayer[],
  valueField: ValueField,
  rankField: PosRankField,
): void {
  const picks = rows.filter(
    (r) => (r.sleeperId.startsWith('pick:') || r.position === 'PICK') && r[valueField] != null,
  )
  picks.sort((a, b) => {
    const av = a[valueField] ?? Number.NEGATIVE_INFINITY
    const bv = b[valueField] ?? Number.NEGATIVE_INFINITY
    if (bv !== av) return bv - av
    return a.sleeperId.localeCompare(b.sleeperId)
  })
  picks.forEach((r, i) => {
    r[rankField] = i + 1
  })
}

export function aggregatePlayerValues(
  players: SleeperPlayer[],
  values: PlayerValue[],
  normMode: NormMode,
): AggregatedPlayer[] {
  if (!values || values.length === 0) return []

  const valuesByPlayer = new Map<string, SourcesMap>()
  for (const val of values) {
    const existing = valuesByPlayer.get(val.sleeperId) ?? {}
    existing[val.sourceId] = val
    valuesByPlayer.set(val.sleeperId, existing)
  }

  const results: AggregatedPlayer[] = []
  for (const [sleeperId, sources] of valuesByPlayer) {
    const player = players.find((p) => p.playerId === sleeperId)
    const isPick = sleeperId.startsWith('pick:')

    const dFc = fcDyn(sources)
    const dKtc = ktcDyn(sources)
    const dDd = ddDyn(sources)
    const rFc = fcRd(sources)
    const rKtc = ktcRd(sources)
    const rDd = ddRd(sources)

    const dynTierAvgVal = dFc?.tierAvg ?? dKtc?.tierAvg ?? dDd?.tierAvg ?? null
    const rdTierAvgVal = rFc?.tierAvg ?? rKtc?.tierAvg ?? rDd?.tierAvg ?? null
    const dFn = pickNorm(dFc, normMode)
    const dKn = pickNorm(dKtc, normMode)
    const dDn = pickNorm(dDd, normMode)
    const rFn = pickNorm(rFc, normMode)
    const rKn = pickNorm(rKtc, normMode)
    const rDn = pickNorm(rDd, normMode)

    results.push({
      sleeperId,
      name: isPick
        ? sleeperId.replace('pick:', '').replace(/:/g, ' ').toUpperCase()
        : player
          ? `${player.firstName} ${player.lastName}`
          : sleeperId,
      team: isPick ? null : player?.team ?? null,
      position: isPick ? 'PICK' : player?.position ?? null,
      dynTierAvg: dynTierAvgVal,
      dynTierFc: dFc?.tierFc ?? null,
      dynTierKtc: dKtc?.tierKtc ?? null,
      dynTierDd: dDd?.tierDd ?? null,
      dynFcValue: dFc?.value ?? null,
      dynFcNorm: pickNorm(dFc, normMode),
      dynFcRank: dFc?.overallRank ?? null,
      dynFcPosRank: null,
      dynKtcValue: dKtc?.value ?? null,
      dynKtcNorm: pickNorm(dKtc, normMode),
      dynKtcRank: dKtc?.overallRank ?? null,
      dynKtcPosRank: null,
      dynDdValue: dDd?.value ?? null,
      dynDdNorm: pickNorm(dDd, normMode),
      dynDdRank: dDd?.overallRank ?? null,
      dynDdPosRank: null,
      dynAvgNorm: avgNormMulti(normMode, [dFc, dKtc, dDd]),
      dynAvgRank: null,
      dynAvgPosRank: null,
      rdTierAvg: rdTierAvgVal,
      rdTierFc: rFc?.tierFc ?? null,
      rdTierKtc: rKtc?.tierKtc ?? null,
      rdTierDd: rDd?.tierDd ?? null,
      rdFcValue: rFc?.value ?? null,
      rdFcNorm: pickNorm(rFc, normMode),
      rdFcRank: rFc?.overallRank ?? null,
      rdFcPosRank: null,
      rdKtcValue: rKtc?.value ?? null,
      rdKtcNorm: pickNorm(rKtc, normMode),
      rdKtcRank: rKtc?.overallRank ?? null,
      rdKtcPosRank: null,
      rdDdValue: rDd?.value ?? null,
      rdDdNorm: pickNorm(rDd, normMode),
      rdDdRank: rDd?.overallRank ?? null,
      rdDdPosRank: null,
      rdAvgNorm: avgNormMulti(normMode, [rFc, rKtc, rDd]),
      rdAvgRank: null,
      rdAvgPosRank: null,
      dynDeltaNormFcVsKtc: dFn != null && dKn != null ? dFn - dKn : null,
      dynDeltaNormDdVsKtc: dDn != null && dKn != null ? dDn - dKn : null,
      rdDeltaNormFcVsKtc: rFn != null && rKn != null ? rFn - rKn : null,
      rdDeltaNormDdVsKtc: rDn != null && rKn != null ? rDn - rKn : null,
    })
  }

  stampPositionalRank(results, 'dynKtcValue', 'dynKtcPosRank')
  stampPositionalRank(results, 'dynFcValue', 'dynFcPosRank')
  stampPositionalRank(results, 'dynDdValue', 'dynDdPosRank')
  stampPositionalRank(results, 'rdKtcValue', 'rdKtcPosRank')
  stampPositionalRank(results, 'rdFcValue', 'rdFcPosRank')
  stampPositionalRank(results, 'rdDdValue', 'rdDdPosRank')
  stampPositionalRank(results, 'dynAvgNorm', 'dynAvgPosRank')
  stampPositionalRank(results, 'rdAvgNorm', 'rdAvgPosRank')
  stampOverallRank(results, 'dynAvgNorm', 'dynAvgRank')
  stampOverallRank(results, 'rdAvgNorm', 'rdAvgRank')

  stampPickPoolRank(results, 'dynKtcValue', 'dynKtcPosRank')
  stampPickPoolRank(results, 'dynFcValue', 'dynFcPosRank')
  stampPickPoolRank(results, 'dynDdValue', 'dynDdPosRank')
  stampPickPoolRank(results, 'rdKtcValue', 'rdKtcPosRank')
  stampPickPoolRank(results, 'rdFcValue', 'rdFcPosRank')
  stampPickPoolRank(results, 'rdDdValue', 'rdDdPosRank')
  stampPickPoolRank(results, 'dynAvgNorm', 'dynAvgPosRank')
  stampPickPoolRank(results, 'rdAvgNorm', 'rdAvgPosRank')

  return results
}
