/**
 * CLI sync script – fetches data from all sources and writes to Neon Postgres.
 *
 * Usage:
 *   pnpm sync
 *
 * Loads `.env.local` from the repo root when `DATABASE_URL` is not already set.
 * You can still override with `DATABASE_URL=... pnpm sync`.
 *
 * ─── SECRETS REQUIRED ───
 * DATABASE_URL — your Neon pooled connection string (in `.env.local` or env)
 * ────────────────────────
 */
import { neon } from '@neondatabase/serverless'
import type { SleeperPlayer, PlayerValue, SyncMetadata } from '../app/lib/db/schema'
import { dedupePlayerValuesById } from '../app/lib/sync/resolve-values'
import { loadEnvLocalFromCwd } from './load-env-local'

loadEnvLocalFromCwd()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.')
  console.error('Set it to your Neon connection string before running sync.')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

function esc(val: string | null | undefined): string {
  return `'${String(val ?? '').replace(/'/g, "''")}'`
}
function escNull(val: string | null | undefined): string {
  return val == null ? 'NULL' : esc(val)
}
function escNum(val: number | null | undefined): string {
  return val === null || val === undefined ? 'NULL' : String(val)
}

async function upsertPlayers(players: SleeperPlayer[]) {
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
  const unique = dedupePlayerValuesById(values)
  if (unique.length < values.length) {
    console.warn(
      `[Sync] Deduplicated player_values before insert: ${values.length} -> ${unique.length} rows (duplicate ids)`,
    )
  }

  await sql`TRUNCATE player_values`
  const BATCH_SIZE = 500

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE)
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
  console.log('\n[Sleeper] Fetching all NFL players...')
  const { fetchAllPlayers } = await import('../app/lib/sources/sleeper/client.js')
  const raw = await fetchAllPlayers()

  type SleeperApiPlayer = {
    player_id?: string
    first_name?: string | null
    last_name?: string | null
    team?: string | null
    position?: string | null
    age?: number | null
    years_exp?: number | null
    search_full_name?: string | null
    status?: string | null
    sport?: string
  }

  const players: SleeperPlayer[] = Object.values(raw as Record<string, SleeperApiPlayer>)
    .filter((p) => Boolean(p.player_id?.trim()))
    .filter((p) => p.sport === 'nfl' || p.position != null)
    .map((p) => {
      const playerId = p.player_id!.trim()
      const first = p.first_name ?? ''
      const last = p.last_name ?? ''
      const search =
        (p.search_full_name?.trim() || `${first} ${last}`.trim()) || playerId
      return {
        playerId,
        firstName: first,
        lastName: last,
        team: p.team ?? null,
        position: p.position ?? null,
        age: p.age ?? null,
        yearsExp: p.years_exp ?? null,
        searchFullName: search,
        status: p.status ?? null,
      }
    })

  await upsertPlayers(players)
  console.log(`[Sleeper] Saved ${players.length} players to Neon`)
  return players
}

async function syncFantasyCalcBoth(players: SleeperPlayer[]) {
  console.log('\n[FantasyCalc] Fetching dynasty + redraft...')
  const { FantasyCalcProvider } = await import('../app/lib/sources/fantasycalc/provider.js')
  const { resolveValues } = await import('../app/lib/sync/resolve-values.js')
  const { SOURCE_FC_DYNASTY, SOURCE_FC_REDRAFT } = await import('../app/lib/sync/tiering.js')

  const provider = new FantasyCalcProvider()
  const base = { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1 }

  const rawD = await provider.fetch({ ...base, isDynasty: true })
  const normD = provider.normalize(rawD)
  const rD = resolveValues(SOURCE_FC_DYNASTY, normD, players)

  const rawR = await provider.fetch({ ...base, isDynasty: false })
  const normR = provider.normalize(rawR)
  const rR = resolveValues(SOURCE_FC_REDRAFT, normR, players)

  console.log(`[FantasyCalc] Dynasty ${rD.resolved.length}, redraft ${rR.resolved.length}`)
  return {
    resolved: [...rD.resolved, ...rR.resolved],
    unresolved: [...rD.unresolved, ...rR.unresolved],
  }
}

async function syncKtcBoth(players: SleeperPlayer[]) {
  console.log('\n[KTC] Scraping dynasty + redraft...')
  const { KtcProvider } = await import('../app/lib/sources/ktc/provider.js')
  const { resolveValues } = await import('../app/lib/sync/resolve-values.js')
  const { SOURCE_KTC_DYNASTY, SOURCE_KTC_REDRAFT } = await import('../app/lib/sync/tiering.js')

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
    console.error('[KTC] Redraft failed:', e instanceof Error ? e.message : e)
  }

  console.log(`[KTC] Dynasty ${rD.resolved.length}, redraft ${rR.resolved.length}`)
  return {
    resolved: [...rD.resolved, ...rR.resolved],
    unresolved: [...rD.unresolved, ...rR.unresolved],
  }
}

async function syncDynastyDaddyBoth(players: SleeperPlayer[]) {
  console.log('\n[Dynasty Daddy] CSV dynasty + ADP/redraft...')
  const { DynastyDaddyProvider } = await import('../app/lib/sources/dynasty-daddy/provider.js')
  const { resolveValues } = await import('../app/lib/sync/resolve-values.js')
  const { SOURCE_DD_DYNASTY, SOURCE_DD_REDRAFT } = await import('../app/lib/sync/tiering.js')

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
    console.error('[Dynasty Daddy] Redraft failed:', e instanceof Error ? e.message : e)
  }

  console.log(`[Dynasty Daddy] Dynasty ${rD.resolved.length}, redraft ${rR.resolved.length}`)
  return {
    resolved: [...rD.resolved, ...rR.resolved],
    unresolved: [...rD.unresolved, ...rR.unresolved],
  }
}

async function main() {
  console.log('=== Fantasy Sync Script ===')
  console.log('[Sync] Writing to Neon Postgres')

  const players = await syncSleeperPlayers()

  const fcResult = await syncFantasyCalcBoth(players)
  let ktcResult = { resolved: [] as any[], unresolved: [] as any[] }

  try {
    ktcResult = await syncKtcBoth(players)
  } catch (e) {
    console.error('[KTC] Failed:', e instanceof Error ? e.message : e)
    console.log('[KTC] Continuing without KTC data...')
  }

  let ddResult = { resolved: [] as any[], unresolved: [] as any[] }
  try {
    ddResult = await syncDynastyDaddyBoth(players)
  } catch (e) {
    console.error('[Dynasty Daddy] Failed:', e instanceof Error ? e.message : e)
    console.log('[Dynasty Daddy] Continuing without DD data...')
  }

  const { applyQuantileMatchedNorms } = await import('../app/lib/sync/quantile-match.js')
  const { assignTierDimensions } = await import('../app/lib/sync/tiering.js')
  const mergedResolved = [...fcResult.resolved, ...ktcResult.resolved, ...ddResult.resolved]
  const allResolved = assignTierDimensions(applyQuantileMatchedNorms(mergedResolved))

  await writeAllValues(allResolved)

  const {
    SOURCE_FC_DYNASTY,
    SOURCE_FC_REDRAFT,
    SOURCE_KTC_DYNASTY,
    SOURCE_KTC_REDRAFT,
    SOURCE_DD_DYNASTY,
    SOURCE_DD_REDRAFT,
  } = await import('../app/lib/sync/tiering.js')

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
      status: ktcResult.resolved.some((r: any) => r.sourceId === SOURCE_KTC_DYNASTY) ? 'success' : 'error',
      recordCount: ktcResult.resolved.filter((r: any) => r.sourceId === SOURCE_KTC_DYNASTY).length,
      error: null,
    },
    [SOURCE_KTC_REDRAFT]: {
      lastSyncedAt: new Date().toISOString(),
      sourceId: SOURCE_KTC_REDRAFT,
      status: ktcResult.resolved.some((r: any) => r.sourceId === SOURCE_KTC_REDRAFT) ? 'success' : 'error',
      recordCount: ktcResult.resolved.filter((r: any) => r.sourceId === SOURCE_KTC_REDRAFT).length,
      error: null,
    },
    [SOURCE_DD_DYNASTY]: {
      lastSyncedAt: new Date().toISOString(),
      sourceId: SOURCE_DD_DYNASTY,
      status: ddResult.resolved.some((r: any) => r.sourceId === SOURCE_DD_DYNASTY) ? 'success' : 'error',
      recordCount: ddResult.resolved.filter((r: any) => r.sourceId === SOURCE_DD_DYNASTY).length,
      error: null,
    },
    [SOURCE_DD_REDRAFT]: {
      lastSyncedAt: new Date().toISOString(),
      sourceId: SOURCE_DD_REDRAFT,
      status: ddResult.resolved.some((r: any) => r.sourceId === SOURCE_DD_REDRAFT) ? 'success' : 'error',
      recordCount: ddResult.resolved.filter((r: any) => r.sourceId === SOURCE_DD_REDRAFT).length,
      error: null,
    },
  }

  await writeSyncMetadata(metadata)

  console.log('\n=== Sync Complete ===')
  console.log(`  Players: ${players.length}`)
  console.log(`  Values:  ${allResolved.length}`)
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
