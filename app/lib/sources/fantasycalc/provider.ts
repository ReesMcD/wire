import type { DataSourceConfig, DataSourceProvider, NormalizedPlayerValue } from '../types'
import type { FantasyCalcEntry } from './types'
import { fetchFantasyCalcValues } from './client'

export class FantasyCalcProvider implements DataSourceProvider<FantasyCalcEntry[]> {
  readonly id = 'fantasycalc'
  readonly name = 'FantasyCalc'
  readonly type = 'values' as const

  async fetch(config?: DataSourceConfig): Promise<FantasyCalcEntry[]> {
    return fetchFantasyCalcValues({
      isDynasty: config?.isDynasty ?? true,
      numQbs: config?.numQbs ?? 2,
      numTeams: config?.numTeams ?? 12,
      ppr: config?.ppr ?? 1,
    })
  }

  normalize(raw: FantasyCalcEntry[]): NormalizedPlayerValue[] {
    return raw.map((entry) => {
      const pickId = parseFantasyCalcPick(entry.player.name, entry.player.position)

      return {
        sleeperId: pickId ?? (entry.player.sleeperId || undefined),
        name: entry.player.name,
        team: entry.player.maybeTeam,
        position: pickId ? 'PICK' : entry.player.position,
        value: entry.value,
        overallRank: entry.overallRank,
        positionRank: entry.positionRank,
        trend: entry.trend30Day,
        tier: entry.maybeTier,
      }
    })
  }
}

function parseFantasyCalcPick(name: string, position: string): string | null {
  if (position === 'PICK' || position === 'Pick') {
    return parseFcPickName(name)
  }

  const pickPattern = /^(\d{4})\s+(?:Mid\s+|Early\s+|Late\s+)?(\d+)\w{2}$|^(\d{4})\s+(First|Second|Third|Fourth|1st|2nd|3rd|4th)$/i
  const match = name.match(pickPattern)
  if (!match) return null

  return parseFcPickName(name)
}

function parseFcPickName(name: string): string | null {
  const roundWords: Record<string, number> = {
    first: 1, '1st': 1,
    second: 2, '2nd': 2,
    third: 3, '3rd': 3,
    fourth: 4, '4th': 4,
  }

  const match = name.match(/^(\d{4})\s+(?:(Early|Mid|Late)\s+)?(\w+)$/i)
  if (!match) return null

  const [, year, tierStr, roundStr] = match
  const roundLower = roundStr.toLowerCase()
  const round = roundWords[roundLower] ?? parseInt(roundStr, 10)

  if (!year || isNaN(round)) return null

  const tier = tierStr ? tierStr.toLowerCase() : 'mid'
  return `pick:${year}:${round}:${tier}`
}
