import { defineTask } from 'nitro/task'
import { resolve } from 'path'
import { mkdir, writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'

const DATA_DIR = resolve(process.cwd(), 'data')

async function ensureDir(dir: string) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
}

async function writeJson(relativePath: string, data: unknown) {
  const fullPath = resolve(DATA_DIR, relativePath)
  await ensureDir(resolve(fullPath, '..'))
  await writeFile(fullPath, JSON.stringify(data, null, 2))
  console.log(`  Written: ${relativePath}`)
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
  const players = Object.values(raw as Record<string, SleeperApiPlayer>)
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

  await writeJson('players.json', players)
  console.log(`[Sync Task] Saved ${players.length} players`)
  return players
}

async function syncFantasyCalcBoth(players: any[]) {
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

async function syncKtcBoth(players: any[]) {
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

async function syncDynastyDaddyBoth(players: any[]) {
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
    console.log(`Data directory: ${DATA_DIR}`)
    await ensureDir(DATA_DIR)

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
    const allUnresolved = [...fcResult.unresolved, ...ktcResult.unresolved, ...ddResult.unresolved]

    await writeJson('values.json', allResolved)
    await writeJson('unresolved.json', allUnresolved)

    const metadata: Record<string, any> = {
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

    await writeJson('sync-metadata.json', metadata)

    const summary = {
      players: players.length,
      values: allResolved.length,
      unresolved: allUnresolved.length,
      syncedAt: new Date().toISOString(),
    }

    console.log('\n=== Sync Task Complete ===')
    console.log(`  Players: ${summary.players}`)
    console.log(`  Values:  ${summary.values}`)
    console.log(`  Unresolved: ${summary.unresolved}`)

    return { result: summary }
  },
})
