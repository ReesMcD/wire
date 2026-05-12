import { getDb } from '@/lib/db/connection'
import type { SleeperPlayer, PlayerValue, SyncMetadata } from '@/lib/db/schema'
import { applyQuantileMatchedNorms } from '@/lib/sync/quantile-match'
import { assignTierDimensions } from '@/lib/sync/tiering'

/**
 * Upsert all players into the `players` table.
 * Uses batched inserts (500 at a time) with ON CONFLICT DO UPDATE.
 */
export async function writePlayers(players: SleeperPlayer[]) {
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

/**
 * Merge new values with existing, apply quantile matching + tiering, then upsert all.
 * Returns the full merged and processed values array.
 */
export async function writeValues(values: PlayerValue[]): Promise<PlayerValue[]> {
  const sql = getDb()

  const existingRows = await sql`SELECT * FROM player_values`
  const existing: PlayerValue[] = existingRows.map((r) => ({
    id: r.id,
    sleeperId: r.sleeper_id,
    sourceId: r.source_id,
    value: r.value,
    normalizedValue: r.normalized_value,
    normalizedValueQm: r.normalized_value_qm ?? null,
    overallRank: r.overall_rank ?? null,
    positionRank: r.position_rank ?? null,
    trend: r.trend ?? null,
    tierAvg: r.tier_avg ?? null,
    tierFc: r.tier_fc ?? null,
    tierKtc: r.tier_ktc ?? null,
    tierDd: r.tier_dd ?? null,
    updatedAt: r.updated_at,
  }))

  const byId = new Map(existing.map((v) => [v.id, v]))
  for (const v of values) {
    byId.set(v.id, v)
  }

  const merged = Array.from(byId.values()).map((v) => ({
    ...v,
    tierDd: (v as PlayerValue & { tierDd?: number | null }).tierDd ?? null,
  }))
  const withQm = applyQuantileMatchedNorms(merged)
  const out = assignTierDimensions(withQm)

  await upsertPlayerValues(out)
  return out
}

/**
 * Full replace of all player values in the database.
 * Used by the sync task which computes everything from scratch.
 */
export async function writeAllValues(values: PlayerValue[]) {
  const sql = getDb()
  await sql`TRUNCATE player_values`
  await upsertPlayerValues(values)
}

async function upsertPlayerValues(values: PlayerValue[]) {
  const sql = getDb()
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

export async function updateSyncMetadata(sourceId: string, meta: Omit<SyncMetadata, 'sourceId'>) {
  const sql = getDb()
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

export async function readPlayersFromDisk(): Promise<SleeperPlayer[]> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM players`
  return rows.map((r) => ({
    playerId: r.player_id,
    firstName: r.first_name,
    lastName: r.last_name,
    team: r.team ?? null,
    position: r.position ?? null,
    age: r.age ?? null,
    yearsExp: r.years_exp ?? null,
    searchFullName: r.search_full_name,
    status: r.status ?? null,
  }))
}

function esc(val: string): string {
  return `'${val.replace(/'/g, "''")}'`
}

function escNull(val: string | null): string {
  return val === null ? 'NULL' : esc(val)
}

function escNum(val: number | null | undefined): string {
  return val === null || val === undefined ? 'NULL' : String(val)
}
