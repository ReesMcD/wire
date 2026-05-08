import { createServerFn } from '@tanstack/react-start'
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { existsSync } from 'fs'
import type { SleeperPlayer, PlayerValue, SyncMetadata } from '@/lib/db/schema'

const DATA_DIR = resolve(process.cwd(), 'data')

async function readJsonFile<T>(filename: string): Promise<T | null> {
  const filePath = resolve(DATA_DIR, filename)
  if (!existsSync(filePath)) return null
  const raw = await readFile(filePath, 'utf-8')
  return JSON.parse(raw) as T
}

export const readPlayers = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SleeperPlayer[]> => {
    return (await readJsonFile<SleeperPlayer[]>('players.json')) ?? []
  },
)

export const readValues = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PlayerValue[]> => {
    return (await readJsonFile<PlayerValue[]>('values.json')) ?? []
  },
)

export const readSyncMetadata = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Record<string, SyncMetadata>> => {
    return (await readJsonFile<Record<string, SyncMetadata>>('sync-metadata.json')) ?? {}
  },
)
