import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdir, writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DATA_DIR = resolve(ROOT, 'data')

async function ensureDir(dir: string) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
}

async function writeJson(relativePath: string, data: unknown) {
  const fullPath = resolve(DATA_DIR, relativePath)
  await ensureDir(dirname(fullPath))
  await writeFile(fullPath, JSON.stringify(data, null, 2))
  console.log(`  Written: ${relativePath}`)
}

async function readJson<T>(relativePath: string): Promise<T | null> {
  const fullPath = resolve(DATA_DIR, relativePath)
  if (!existsSync(fullPath)) return null
  const raw = await readFile(fullPath, 'utf-8')
  return JSON.parse(raw) as T
}

async function syncSleeperPlayers() {
  console.log('\n[Sleeper] Fetching all NFL players...')
  const { fetchAllPlayers } = await import('../app/lib/sources/sleeper/client.js')
  const raw = await fetchAllPlayers()

  type SleeperApiPlayer = { player_id: string; first_name: string; last_name: string; team: string | null; position: string | null; age: number | null; years_exp: number | null; search_full_name: string; status: string | null; sport: string }

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
  console.log(`[Sleeper] Saved ${players.length} players`)
  return players
}

async function syncFantasyCalcBoth(players: any[]) {
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

async function syncKtcBoth(players: any[]) {
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

async function syncDynastyDaddyBoth(players: any[]) {
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
  console.log(`Data directory: ${DATA_DIR}`)
  await ensureDir(DATA_DIR)

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
  const allUnresolved = [...fcResult.unresolved, ...ktcResult.unresolved, ...ddResult.unresolved]

  await writeJson('values.json', allResolved)
  await writeJson('unresolved.json', allUnresolved)

  const {
    SOURCE_FC_DYNASTY,
    SOURCE_FC_REDRAFT,
    SOURCE_KTC_DYNASTY,
    SOURCE_KTC_REDRAFT,
    SOURCE_DD_DYNASTY,
    SOURCE_DD_REDRAFT,
  } = await import('../app/lib/sync/tiering.js')

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

  await writeJson('sync-metadata.json', metadata)

  console.log('\n=== Sync Complete ===')
  console.log(`  Players: ${players.length}`)
  console.log(`  Values:  ${allResolved.length}`)
  console.log(`  Unresolved: ${allUnresolved.length}`)
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
