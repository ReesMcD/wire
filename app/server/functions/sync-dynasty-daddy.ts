import { createServerFn } from '@tanstack/react-start'
import { DynastyDaddyProvider } from '@/lib/sources/dynasty-daddy/provider'
import { resolveValues } from '@/lib/sync/resolve-values'
import { writeValues, updateSyncMetadata, readPlayersFromDisk } from './write-data'
import { SOURCE_DD_DYNASTY, SOURCE_DD_REDRAFT } from '@/lib/sync/tiering'
import type { PlayerValue } from '@/lib/db/schema'

const provider = new DynastyDaddyProvider()

export const syncDynastyDaddy = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PlayerValue[]> => {
    console.log('[DD] Downloading dynasty + ADP/redraft CSV...')

    const players = await readPlayersFromDisk()
    if (players.length === 0) {
      throw new Error('No players in database. Sync Sleeper players first.')
    }

    const rawDynasty = await provider.fetch({ rankingMode: 'dynasty' })
    const valuesDyn = provider.normalize(rawDynasty)
    const dynResolved = resolveValues(SOURCE_DD_DYNASTY, valuesDyn, players)

    let redResolved: ReturnType<typeof resolveValues>['resolved'] = []
    let redraftErr: string | null = null

    try {
      const rawRedraft = await provider.fetch({ rankingMode: 'redraft' })
      const valuesRd = provider.normalize(rawRedraft)
      const rd = resolveValues(SOURCE_DD_REDRAFT, valuesRd, players)
      redResolved = rd.resolved
    } catch (e) {
      redraftErr = e instanceof Error ? e.message : String(e)
      console.error('[DD] ADP/redraft CSV failed:', redraftErr)
    }

    console.log(
      `[DD] Resolved dynasty ${dynResolved.resolved.length}, redraft ${redResolved.length}`,
    )

    const merged = await writeValues([...dynResolved.resolved, ...redResolved])

    await updateSyncMetadata(SOURCE_DD_DYNASTY, {
      lastSyncedAt: new Date().toISOString(),
      status: 'success',
      error: null,
      recordCount: dynResolved.resolved.length,
    })

    await updateSyncMetadata(SOURCE_DD_REDRAFT, {
      lastSyncedAt: new Date().toISOString(),
      status: redraftErr ? 'error' : redResolved.length > 0 ? 'success' : 'error',
      error: redraftErr,
      recordCount: redResolved.length,
    })

    return merged.filter(
      (v) => v.sourceId === SOURCE_DD_DYNASTY || v.sourceId === SOURCE_DD_REDRAFT,
    )
  },
)
