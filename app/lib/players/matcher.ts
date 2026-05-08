import type { SleeperPlayer } from '@/lib/db/schema'
import type { PlayerMatchInput, PlayerMatchResult } from './types'
import {
  buildCompositeKey,
  buildFuzzyKey,
  normalizeName,
  normalizeTeam,
  splitFullName,
} from './normalizers'

export class PlayerMatcher {
  private byId = new Map<string, string>()
  private byCompositeKey = new Map<string, string>()
  private byFuzzyKey = new Map<string, string[]>()

  constructor(players: SleeperPlayer[]) {
    this.buildIndices(players)
  }

  private buildIndices(players: SleeperPlayer[]): void {
    for (const player of players) {
      this.byId.set(player.playerId, player.playerId)

      const compositeKey = buildCompositeKey(
        player.firstName,
        player.lastName,
        player.team,
        player.position,
      )
      this.byCompositeKey.set(compositeKey, player.playerId)

      const fuzzyKey = buildFuzzyKey(player.firstName, player.lastName)
      const existing = this.byFuzzyKey.get(fuzzyKey) ?? []
      existing.push(player.playerId)
      this.byFuzzyKey.set(fuzzyKey, existing)
    }
  }

  match(input: PlayerMatchInput): PlayerMatchResult {
    if (input.sleeperId) {
      const found = this.byId.get(input.sleeperId)
      if (found) {
        return { sleeperId: found, confidence: 'exact', matchedVia: 'sleeperId' }
      }
    }

    const { firstName, lastName } = this.resolveNames(input)
    if (!firstName && !lastName) {
      return { sleeperId: null, confidence: 'unresolved', matchedVia: null }
    }

    const compositeKey = buildCompositeKey(firstName, lastName, input.team, input.position)
    const compositeMatch = this.byCompositeKey.get(compositeKey)
    if (compositeMatch) {
      return { sleeperId: compositeMatch, confidence: 'high', matchedVia: 'compositeKey' }
    }

    const fuzzyKey = buildFuzzyKey(firstName, lastName)
    const fuzzyMatches = this.byFuzzyKey.get(fuzzyKey)
    if (fuzzyMatches && fuzzyMatches.length === 1) {
      return { sleeperId: fuzzyMatches[0], confidence: 'low', matchedVia: 'fuzzy' }
    }

    if (fuzzyMatches && fuzzyMatches.length > 1 && input.team) {
      const teamNorm = normalizeTeam(input.team)
      const teamFiltered = fuzzyMatches.filter((id) => {
        const key = Array.from(this.byCompositeKey.entries()).find(([, v]) => v === id)
        return key && key[0].includes(`:${teamNorm}:`)
      })
      if (teamFiltered.length === 1) {
        return { sleeperId: teamFiltered[0], confidence: 'low', matchedVia: 'fuzzy' }
      }
    }

    return { sleeperId: null, confidence: 'unresolved', matchedVia: null }
  }

  matchBatch(inputs: PlayerMatchInput[]): PlayerMatchResult[] {
    return inputs.map((input) => this.match(input))
  }

  private resolveNames(input: PlayerMatchInput): { firstName: string; lastName: string } {
    if (input.firstName && input.lastName) {
      return { firstName: input.firstName, lastName: input.lastName }
    }
    if (input.name) {
      return splitFullName(input.name)
    }
    return { firstName: input.firstName ?? '', lastName: input.lastName ?? '' }
  }
}
