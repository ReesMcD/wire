import type { DataSourceConfig, DataSourceProvider, NormalizedPlayerValue } from '../types'
import type { KtcRawPlayer } from './types'
import { scrapeKtcRankings } from './scraper'

export class KtcProvider implements DataSourceProvider<KtcRawPlayer[]> {
  readonly id = 'ktc'
  readonly name = 'KeepTradeCut'
  readonly type = 'values' as const

  async fetch(config?: DataSourceConfig): Promise<KtcRawPlayer[]> {
    const format = (config?.numQbs ?? 2) >= 2 ? '2qb' : '1qb'
    const rankingMode = config?.rankingMode ?? 'dynasty'
    return scrapeKtcRankings(format, rankingMode)
  }

  normalize(raw: KtcRawPlayer[]): NormalizedPlayerValue[] {
    return raw.map((entry) => {
      const pickId = entry.pickData
        ? `pick:${entry.pickData.year}:${entry.pickData.round}:${entry.pickData.tier}`
        : undefined

      return {
        sleeperId: pickId,
        name: entry.playerName,
        team: entry.team,
        position: entry.position || null,
        value: entry.value,
        overallRank: entry.overallRank,
        positionRank: entry.positionRank,
        trend: entry.trend,
        tier: entry.tier,
      }
    })
  }
}
