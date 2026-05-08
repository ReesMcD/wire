import type { DataSourceConfig, DataSourceProvider, NormalizedPlayerValue } from '../types'
import type { DynastyDaddyCsvRow, DynastyDaddyRankingMode } from './types'
import { scrapeDynastyDaddyCsv } from './scraper'
import { parseDdPickSleeperId } from './pick-id'

export class DynastyDaddyProvider implements DataSourceProvider<DynastyDaddyCsvRow[]> {
  readonly id = 'dynasty_daddy'
  readonly name = 'Dynasty Daddy'
  readonly type = 'values' as const

  async fetch(config?: DataSourceConfig): Promise<DynastyDaddyCsvRow[]> {
    const rankingMode: DynastyDaddyRankingMode = config?.rankingMode === 'redraft' ? 'redraft' : 'dynasty'
    return scrapeDynastyDaddyCsv(rankingMode)
  }

  normalize(raw: DynastyDaddyCsvRow[]): NormalizedPlayerValue[] {
    return raw.map((row) => {
      const pickId = parseDdPickSleeperId(row.fullName, row.position)
      const posRaw = (row.position ?? '').trim()
      const positionForMatch = pickId ? 'PICK' : (posRaw.replace(/\d+/g, '').trim() || null)

      return {
        sleeperId: pickId ?? undefined,
        name: row.fullName,
        team: row.team,
        position: positionForMatch,
        value: row.value,
        overallRank: row.rank,
        positionRank: null,
        trend: row.trend,
        tier: null,
      }
    })
  }
}
