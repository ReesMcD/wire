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
  dynKtcValue: number | null
  dynKtcNorm: number | null
  dynKtcRank: number | null
  dynDdValue: number | null
  dynDdNorm: number | null
  dynDdRank: number | null
  dynAvgNorm: number | null
  rdTierAvg: number | null
  rdTierFc: number | null
  rdTierKtc: number | null
  rdTierDd: number | null
  rdFcValue: number | null
  rdFcNorm: number | null
  rdFcRank: number | null
  rdKtcValue: number | null
  rdKtcNorm: number | null
  rdKtcRank: number | null
  rdDdValue: number | null
  rdDdNorm: number | null
  rdDdRank: number | null
  rdAvgNorm: number | null
  dynDeltaNormFcVsKtc: number | null
  dynDeltaTierFcVsKtc: number | null
  dynDeltaTierAvgVsKtc: number | null
  dynDeltaNormDdVsKtc: number | null
  dynDeltaTierDdVsKtc: number | null
  rdDeltaNormFcVsKtc: number | null
  rdDeltaTierFcVsKtc: number | null
  rdDeltaTierAvgVsKtc: number | null
  rdDeltaNormDdVsKtc: number | null
  rdDeltaTierDdVsKtc: number | null
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
      dynKtcValue: dKtc?.value ?? null,
      dynKtcNorm: pickNorm(dKtc, normMode),
      dynKtcRank: dKtc?.overallRank ?? null,
      dynDdValue: dDd?.value ?? null,
      dynDdNorm: pickNorm(dDd, normMode),
      dynDdRank: dDd?.overallRank ?? null,
      dynAvgNorm: avgNormMulti(normMode, [dFc, dKtc, dDd]),
      rdTierAvg: rdTierAvgVal,
      rdTierFc: rFc?.tierFc ?? null,
      rdTierKtc: rKtc?.tierKtc ?? null,
      rdTierDd: rDd?.tierDd ?? null,
      rdFcValue: rFc?.value ?? null,
      rdFcNorm: pickNorm(rFc, normMode),
      rdFcRank: rFc?.overallRank ?? null,
      rdKtcValue: rKtc?.value ?? null,
      rdKtcNorm: pickNorm(rKtc, normMode),
      rdKtcRank: rKtc?.overallRank ?? null,
      rdDdValue: rDd?.value ?? null,
      rdDdNorm: pickNorm(rDd, normMode),
      rdDdRank: rDd?.overallRank ?? null,
      rdAvgNorm: avgNormMulti(normMode, [rFc, rKtc, rDd]),
      dynDeltaNormFcVsKtc: dFn != null && dKn != null ? dFn - dKn : null,
      dynDeltaTierFcVsKtc:
        dFc?.tierFc != null && dKtc?.tierKtc != null ? dFc.tierFc - dKtc.tierKtc : null,
      dynDeltaTierAvgVsKtc:
        dynTierAvgVal != null && dKtc?.tierKtc != null ? dynTierAvgVal - dKtc.tierKtc : null,
      dynDeltaNormDdVsKtc: dDn != null && dKn != null ? dDn - dKn : null,
      dynDeltaTierDdVsKtc:
        dDd?.tierDd != null && dKtc?.tierKtc != null ? dDd.tierDd - dKtc.tierKtc : null,
      rdDeltaNormFcVsKtc: rFn != null && rKn != null ? rFn - rKn : null,
      rdDeltaTierFcVsKtc:
        rFc?.tierFc != null && rKtc?.tierKtc != null ? rFc.tierFc - rKtc.tierKtc : null,
      rdDeltaTierAvgVsKtc:
        rdTierAvgVal != null && rKtc?.tierKtc != null ? rdTierAvgVal - rKtc.tierKtc : null,
      rdDeltaNormDdVsKtc: rDn != null && rKn != null ? rDn - rKn : null,
      rdDeltaTierDdVsKtc:
        rDd?.tierDd != null && rKtc?.tierKtc != null ? rDd.tierDd - rKtc.tierKtc : null,
    })
  }

  return results
}
