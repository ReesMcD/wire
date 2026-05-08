import { writeFile, mkdir } from 'fs/promises'
import { resolve, dirname } from 'path'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import type { SleeperPlayer, PlayerValue, SyncMetadata } from '@/lib/db/schema'
import { applyQuantileMatchedNorms } from '@/lib/sync/quantile-match'
import { assignTierDimensions } from '@/lib/sync/tiering'

const DATA_DIR = resolve(process.cwd(), 'data')

async function ensureDir(dir: string) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
}

async function writeJson(filename: string, data: unknown) {
  await ensureDir(DATA_DIR)
  const filePath = resolve(DATA_DIR, filename)
  await ensureDir(dirname(filePath))
  await writeFile(filePath, JSON.stringify(data, null, 2))
}

async function readJson<T>(filename: string): Promise<T | null> {
  const filePath = resolve(DATA_DIR, filename)
  if (!existsSync(filePath)) return null
  const raw = await readFile(filePath, 'utf-8')
  return JSON.parse(raw) as T
}

export async function writePlayers(players: SleeperPlayer[]) {
  await writeJson('players.json', players)
}

export async function writeValues(values: PlayerValue[]): Promise<PlayerValue[]> {
  const existing = (await readJson<PlayerValue[]>('values.json')) ?? []

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
  await writeJson('values.json', out)
  return out
}

export async function updateSyncMetadata(sourceId: string, meta: Omit<SyncMetadata, 'sourceId'>) {
  const existing = (await readJson<Record<string, SyncMetadata>>('sync-metadata.json')) ?? {}
  existing[sourceId] = { sourceId, ...meta }
  await writeJson('sync-metadata.json', existing)
}

export async function readPlayersFromDisk(): Promise<SleeperPlayer[]> {
  return (await readJson<SleeperPlayer[]>('players.json')) ?? []
}
