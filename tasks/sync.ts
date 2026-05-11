import { defineTask } from 'nitro/task'
import { getDb } from '../app/lib/db/connection'
import type { SleeperPlayer, PlayerValue, SyncMetadata } from '../app/lib/db/schema'

function esc(val: string): string {
  return `'${val.replace(/'/g, "''")}'`
}
function escNull(val: string | null): string {
  return val === null ? 'NULL' : esc(val)
}
function escNum(val: number | null | undefined): string {
  return val === null || val === undefined ? 'NULL' : String(val)
}

async function upsertPlayers(players: SleeperPlayer[]) {
  const sql = getDb()
  const BATCH_SIZE = 500

  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE)
    const values = batch
      .map(
        (p) =>
          `(${esc(p.playerId)}, ${esc(p.firstName)}, ${esc(p.lastName)}, ${escNull(p.team)}, ${escNull(p.position)}, ${escNum(p.age)}, ${escNum(p.yearsExp)}, ${esc(p.searchFullName)}, ${escNull(p.status)})`,
      )
      .join(',\n')

    await sql.query(`
      INSERT INTO players (player_id, first_name, last_name, team, position, age, years_exp, search_full_name, status)
      VALUES ${values}
      ON CONFLICT (player_id) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        team = EXCLUDED.team,
        position = EXCLUDED.position,
        age = EXCLUDED.age,
        years_exp = EXCLUDED.years_exp,
        search_full_name = EXCLUDED.search_full_name,
        status = EXCLUDED.status
    `)
  }
}

async function writeAllValues(values: PlayerValue[]) {
  const sql = getDb()
  await sql`TRUNCATE player_values`
  const BATCH_SIZE = 500

  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE)
    const rows = batch
      .map(
        (v) =>
          `(${esc(v.id)}, ${esc(v.sleeperId)}, ${esc(v.sourceId)}, ${v.value}, ${v.normalizedValue}, ${escNum(v.normalizedValueQm)}, ${escNum(v.overallRank)}, ${escNum(v.positionRank)}, ${escNum(v.trend)}, ${escNum(v.tierAvg)}, ${escNum(v.tierFc)}, ${escNum(v.tierKtc)}, ${escNum(v.tierDd)}, ${esc(v.updatedAt)})`,
      )
      .join(',\n')

    await sql.query(`
      INSERT INTO player_values (id, sleeper_id, source_id, value, normalized_value, normalized_value_qm, overall_rank, position_rank, trend, tier_avg, tier_fc, tier_ktc, tier_dd, updated_at)
      VALUES ${rows}
      ON CONFLICT (id) DO UPDATE SET
        sleeper_id = EXCLUDED.sleeper_id,
        source_id = EXCLUDED.source_id,
        value = EXCLUDED.value,
        normalized_value = EXCLUDED.normalized_value,
        normalized_value_qm = EXCLUDED.normalized_value_qm,
        overall_rank = EXCLUDED.overall_rank,
        position_rank = EXCLUDED.position_rank,
        trend = EXCLUDED.trend,
        tier_avg = EXCLUDED.tier_avg,
        tier_fc = EXCLUDED.tier_fc,
        tier_ktc = EXCLUDED.tier_ktc,
        tier_dd = EXCLUDED.tier_dd,
        updated_at = EXCLUDED.updated_at
    `)
  }
}

async function writeSyncMetadata(metadata: Record<string, SyncMetadata>) {
  const sql = getDb()
  for (const [sourceId, meta] of Object.entries(metadata)) {
    await sql`
      INSERT INTO sync_metadata (source_id, last_synced_at, status, error, record_count)
      VALUES (${sourceId}, ${meta.lastSyncedAt}, ${meta.status}, ${meta.error}, ${meta.recordCount})
      ON CONFLICT (source_id) DO UPDATE SET
        last_synced_at = EXCLUDED.last_synced_at,
        status = EXCLUDED.status,
        error = EXCLUDED.error,
        record_count = EXCLUDED.record_count
    `
  }
}

async function syncSleeperPlayers() {
  console.log('\n[Sync Task] Fetching all NFL players from Sleeper...')
  const { fetchAllPlayers } = await import('../app/lib/sources/sleeper/client')

  type SleeperApiPlayer = {
    player_id: string
    first_name: string
    last_name: string
    team: string | null
    position: string | null
    age: number | null
    years_exp: number | null
    search_full_name: string
    status: string | null
    sport: string
  }

  const raw = await fetchAllPlayers()
  const players: SleeperPlayer[] = Object.values(raw as Record<string, SleeperApiPlayer>)
    .filter((p) => p.sport === 'nfl' || p.position !== null)
    .map((p) => ({
      playerId: p.player_id,
      firstName: p.first_name,
      lastName: p.last_name,
      team: p.team,
      position: p.position,
      age: p.age,
      yearsExp: p.years_exp,
      searchFullName: p.search_full_name,
      status: p.status,
    }))

  await upsertPlayers(players)
  console.log(`[Sync Task] Saved ${players.length} players to Neon`)
  return players
}

async function syncFantasyCalcBoth(players: SleeperPlayer[]) {
  console.log('\n[Sync Task] Fetching FantasyCalc dynasty + redraft...')
  const { FantasyCalcProvider } = await import('../app/lib/sources/fantasycalc/provider')
  const { resolveValues } = await import('../app/lib/sync/resolve-values')
  const { SOURCE_FC_DYNASTY, SOURCE_FC_REDRAFT } = await import('../app/lib/sync/tiering')

  const provider = new FantasyCalcProvider()
  const base = { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1 }

  const rawD = await provider.fetch({ ...base, isDynasty: true })
  const normD = provider.normalize(rawD)
  const rD = resolveValues(SOURCE_FC_DYNASTY, normD, players)

  const rawR = await provider.fetch({ ...base, isDynasty: false })
  const normR = provider.normalize(rawR)
  const rR = resolveValues(SOURCE_FC_REDRAFT, normR, players)

  console.log(`[Sync Task] FantasyCalc: dynasty ${rD.resolved.length}, redraft ${rR.resolved.length}`)
  return {
    resolved: [...rD.resolved, ...rR.resolved],
    unresolved: [...rD.unresolved, ...rR.unresolved],
  }
}

async function syncKtcBoth(players: SleeperPlayer[]) {
  console.log('\n[Sync Task] Scraping KTC dynasty + redraft...')
  const { KtcProvider } = await import('../app/lib/sources/ktc/provider')
  const { resolveValues } = await import('../app/lib/sync/resolve-values')
  const { SOURCE_KTC_DYNASTY, SOURCE_KTC_REDRAFT } = await import('../app/lib/sync/tiering')

  const provider = new KtcProvider()
  const base = { numQbs: 2 }

  const rawD = await provider.fetch({ ...base, rankingMode: 'dynasty' })
  const normD = provider.normalize(rawD)
  const rD = resolveValues(SOURCE_KTC_DYNASTY, normD, players)

  let rR = { resolved: [] as any[], unresolved: [] as any[] }
  try {
    const rawR = await provider.fetch({ ...base, rankingMode: 'redraft' })
    const normR = provider.normalize(rawR)
    rR = resolveValues(SOURCE_KTC_REDRAFT, normR, players)
  } catch (e) {
    console.error('[Sync Task] KTC redraft failed:', e instanceof Error ? e.message : e)
  }

  console.log(`[Sync Task] KTC: dynasty ${rD.resolved.length}, redraft ${rR.resolved.length}`)
  return {
    resolved: [...rD.resolved, ...rR.resolved],
    unresolved: [...rD.unresolved, ...rR.unresolved],
  }
}

async function syncDynastyDaddyBoth(players: SleeperPlayer[]) {
  console.log('\n[Sync Task] Fetching Dynasty Daddy dynasty + redraft...')
  const { DynastyDaddyProvider } = await import('../app/lib/sources/dynasty-daddy/provider')
  const { resolveValues } = await import('../app/lib/sync/resolve-values')
  const { SOURCE_DD_DYNASTY, SOURCE_DD_REDRAFT } = await import('../app/lib/sync/tiering')

  const provider = new DynastyDaddyProvider()

  const rawD = await provider.fetch({ rankingMode: 'dynasty' })
  const normD = provider.normalize(rawD)
  const rD = resolveValues(SOURCE_DD_DYNASTY, normD, players)

  let rR = { resolved: [] as any[], unresolved: [] as any[] }
  try {
    const rawR = await provider.fetch({ rankingMode: 'redraft' })
    const normR = provider.normalize(rawR)
    rR = resolveValues(SOURCE_DD_REDRAFT, normR, players)
  } catch (e) {
    console.error('[Sync Task] Dynasty Daddy redraft failed:', e instanceof Error ? e.message : e)
  }

  console.log(`[Sync Task] Dynasty Daddy: dynasty ${rD.resolved.length}, redraft ${rR.resolved.length}`)
  return {
    resolved: [...rD.resolved, ...rR.resolved],
    unresolved: [...rD.unresolved, ...rR.unresolved],
  }
}

export default defineTask({
  meta: {
    name: 'sync',
    description: 'Sync fantasy football data from all sources (Sleeper, FantasyCalc, KTC, Dynasty Daddy)',
  },
  async run() {
    console.log('=== Fantasy Sync Task ===')
    console.log('[Sync Task] Writing to Neon Postgres')

    const players = await syncSleeperPlayers()

    const fcResult = await syncFantasyCalcBoth(players)

    let ktcResult = { resolved: [] as any[], unresolved: [] as any[] }
    try {
      ktcResult = await syncKtcBoth(players)
    } catch (e) {
      console.error('[Sync Task] KTC failed entirely:', e instanceof Error ? e.message : e)
    }

    let ddResult = { resolved: [] as any[], unresolved: [] as any[] }
    try {
      ddResult = await syncDynastyDaddyBoth(players)
    } catch (e) {
      console.error('[Sync Task] Dynasty Daddy failed entirely:', e instanceof Error ? e.message : e)
    }

    const { applyQuantileMatchedNorms } = await import('../app/lib/sync/quantile-match')
    const { assignTierDimensions } = await import('../app/lib/sync/tiering')
    const {
      SOURCE_FC_DYNASTY,
      SOURCE_FC_REDRAFT,
      SOURCE_KTC_DYNASTY,
      SOURCE_KTC_REDRAFT,
      SOURCE_DD_DYNASTY,
      SOURCE_DD_REDRAFT,
    } = await import('../app/lib/sync/tiering')

    const mergedResolved = [...fcResult.resolved, ...ktcResult.resolved, ...ddResult.resolved]
    const allResolved = assignTierDimensions(applyQuantileMatchedNorms(mergedResolved))

    await writeAllValues(allResolved)

    const metadata: Record<string, SyncMetadata> = {
      sleeper_players: {
        lastSyncedAt: new Date().toISOString(),
        sourceId: 'sleeper_players',
        status: 'success',
        recordCount: players.length,
        error: null,
      },
      [SOURCE_FC_DYNASTY]: {
        lastSyncedAt: new Date().toISOString(),
        sourceId: SOURCE_FC_DYNASTY,
        status: 'success',
        recordCount: fcResult.resolved.filter((r: any) => r.sourceId === SOURCE_FC_DYNASTY).length,
        error: null,
      },
      [SOURCE_FC_REDRAFT]: {
        lastSyncedAt: new Date().toISOString(),
        sourceId: SOURCE_FC_REDRAFT,
        status: 'success',
        recordCount: fcResult.resolved.filter((r: any) => r.sourceId === SOURCE_FC_REDRAFT).length,
        error: null,
      },
      [SOURCE_KTC_DYNASTY]: {
        lastSyncedAt: new Date().toISOString(),
        sourceId: SOURCE_KTC_DYNASTY,
        status: ktcResult.resolved.some((r: any) => r.sourceId === SOURCE_KTC_DYNASTY)
          ? 'success'
          : 'error',
        recordCount: ktcResult.resolved.filter((r: any) => r.sourceId === SOURCE_KTC_DYNASTY).length,
        error: null,
      },
      [SOURCE_KTC_REDRAFT]: {
        lastSyncedAt: new Date().toISOString(),
        sourceId: SOURCE_KTC_REDRAFT,
        status: ktcResult.resolved.some((r: any) => r.sourceId === SOURCE_KTC_REDRAFT)
          ? 'success'
          : 'error',
        recordCount: ktcResult.resolved.filter((r: any) => r.sourceId === SOURCE_KTC_REDRAFT).length,
        error: null,
      },
      [SOURCE_DD_DYNASTY]: {
        lastSyncedAt: new Date().toISOString(),
        sourceId: SOURCE_DD_DYNASTY,
        status: ddResult.resolved.some((r: any) => r.sourceId === SOURCE_DD_DYNASTY)
          ? 'success'
          : 'error',
        recordCount: ddResult.resolved.filter((r: any) => r.sourceId === SOURCE_DD_DYNASTY).length,
        error: null,
      },
      [SOURCE_DD_REDRAFT]: {
        lastSyncedAt: new Date().toISOString(),
        sourceId: SOURCE_DD_REDRAFT,
        status: ddResult.resolved.some((r: any) => r.sourceId === SOURCE_DD_REDRAFT)
          ? 'success'
          : 'error',
        recordCount: ddResult.resolved.filter((r: any) => r.sourceId === SOURCE_DD_REDRAFT).length,
        error: null,
      },
    }

    await writeSyncMetadata(metadata)

    const summary = {
      players: players.length,
      values: allResolved.length,
      syncedAt: new Date().toISOString(),
    }

    console.log('\n=== Sync Task Complete ===')
    console.log(`  Players: ${summary.players}`)
    console.log(`  Values:  ${summary.values}`)

    return { result: summary }
  },
})
