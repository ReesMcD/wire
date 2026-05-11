import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { KtcProvider } from '@/lib/sources/ktc/provider'
import { resolveValues } from '@/lib/sync/resolve-values'
import { writeValues, updateSyncMetadata, readPlayersFromDisk } from './write-data'
import { SOURCE_KTC_DYNASTY, SOURCE_KTC_REDRAFT } from '@/lib/sync/tiering'
import type { PlayerValue } from '@/lib/db/schema'

const provider = new KtcProvider()

export const syncKtc = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      numQbs: z.number().optional().default(2),
    }),
  )
  .handler(async ({ data }): Promise<PlayerValue[]> => {
    console.log('[KTC] Scraping dynasty + redraft...', data)

    const players = await readPlayersFromDisk()
    if (players.length === 0) {
      throw new Error('No players in database. Sync Sleeper players first.')
    }

    const baseCfg = { numQbs: data.numQbs }

    const rawDynasty = await provider.fetch({ ...baseCfg, rankingMode: 'dynasty' })
    const valuesDyn = provider.normalize(rawDynasty)
    const dynResolved = resolveValues(SOURCE_KTC_DYNASTY, valuesDyn, players)

    let redResolved: ReturnType<typeof resolveValues>['resolved'] = []
    let redraftErr: string | null = null

    try {
      const rawRedraft = await provider.fetch({ ...baseCfg, rankingMode: 'redraft' })
      const valuesRd = provider.normalize(rawRedraft)
      const rd = resolveValues(SOURCE_KTC_REDRAFT, valuesRd, players)
      redResolved = rd.resolved
    } catch (e) {
      redraftErr = e instanceof Error ? e.message : String(e)
      console.error('[KTC] Redraft scrape failed:', redraftErr)
    }

    console.log(
      `[KTC] Resolved dynasty ${dynResolved.resolved.length}, redraft ${redResolved.length}`,
    )

    const merged = await writeValues([...dynResolved.resolved, ...redResolved])

    await updateSyncMetadata(SOURCE_KTC_DYNASTY, {
      lastSyncedAt: new Date().toISOString(),
      status: 'success',
      error: null,
      recordCount: dynResolved.resolved.length,
    })

    await updateSyncMetadata(SOURCE_KTC_REDRAFT, {
      lastSyncedAt: new Date().toISOString(),
      status: redraftErr ? 'error' : redResolved.length > 0 ? 'success' : 'error',
      error: redraftErr,
      recordCount: redResolved.length,
    })

    return merged.filter(
      (v) => v.sourceId === SOURCE_KTC_DYNASTY || v.sourceId === SOURCE_KTC_REDRAFT,
    )
  })
