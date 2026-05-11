import { createServerFn } from '@tanstack/react-start'
import { getDb } from '@/lib/db/connection'
import type { SleeperPlayer, PlayerValue, SyncMetadata } from '@/lib/db/schema'

export const readPlayers = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SleeperPlayer[]> => {
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
  },
)

export const readValues = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PlayerValue[]> => {
    const sql = getDb()
    const rows = await sql`SELECT * FROM player_values`
    return rows.map((r) => ({
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
  },
)

export const readSyncMetadata = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Record<string, SyncMetadata>> => {
    const sql = getDb()
    const rows = await sql`SELECT * FROM sync_metadata`
    const result: Record<string, SyncMetadata> = {}
    for (const r of rows) {
      result[r.source_id] = {
        sourceId: r.source_id,
        lastSyncedAt: r.last_synced_at,
        status: r.status as SyncMetadata['status'],
        error: r.error ?? null,
        recordCount: r.record_count,
      }
    }
    return result
  },
)
