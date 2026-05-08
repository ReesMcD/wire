import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { FantasyCalcProvider } from '@/lib/sources/fantasycalc/provider'
import { resolveValues } from '@/lib/sync/resolve-values'
import { writeValues, updateSyncMetadata, readPlayersFromDisk } from './write-data'
import { SOURCE_FC_DYNASTY, SOURCE_FC_REDRAFT } from '@/lib/sync/tiering'
import type { PlayerValue } from '@/lib/db/schema'

const provider = new FantasyCalcProvider()

export const syncFantasyCalc = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      numQbs: z.number().optional().default(2),
      numTeams: z.number().optional().default(12),
      ppr: z.number().optional().default(1),
    }),
  )
  .handler(async ({ data }): Promise<PlayerValue[]> => {
    console.log('[FantasyCalc] Fetching dynasty + redraft...', data)

    const players = await readPlayersFromDisk()
    if (players.length === 0) {
      throw new Error('No players on disk. Sync Sleeper players first.')
    }

    const baseOpts = {
      numQbs: data.numQbs,
      numTeams: data.numTeams,
      ppr: data.ppr,
    }

    const rawDynasty = await provider.fetch({ ...baseOpts, isDynasty: true })
    const normalizedDynasty = provider.normalize(rawDynasty)
    const dynResolved = resolveValues(SOURCE_FC_DYNASTY, normalizedDynasty, players)

    const rawRedraft = await provider.fetch({ ...baseOpts, isDynasty: false })
    const normalizedRedraft = provider.normalize(rawRedraft)
    const redResolved = resolveValues(SOURCE_FC_REDRAFT, normalizedRedraft, players)

    console.log(
      `[FantasyCalc] Resolved dynasty ${dynResolved.resolved.length}, redraft ${redResolved.resolved.length}`,
    )

    const merged = await writeValues([...dynResolved.resolved, ...redResolved.resolved])

    await updateSyncMetadata(SOURCE_FC_DYNASTY, {
      lastSyncedAt: new Date().toISOString(),
      status: 'success',
      error: null,
      recordCount: dynResolved.resolved.length,
    })
    await updateSyncMetadata(SOURCE_FC_REDRAFT, {
      lastSyncedAt: new Date().toISOString(),
      status: 'success',
      error: null,
      recordCount: redResolved.resolved.length,
    })

    return merged.filter((v) => v.sourceId === SOURCE_FC_DYNASTY || v.sourceId === SOURCE_FC_REDRAFT)
  })
