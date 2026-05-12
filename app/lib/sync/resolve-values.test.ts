import assert from 'node:assert'
import { test } from 'node:test'
import type { SleeperPlayer } from '@/lib/db/schema'
import type { NormalizedPlayerValue } from '@/lib/sources/types'
import { dedupePlayerValuesById, resolveValues } from './resolve-values'

const minimalPlayer = (overrides: Partial<SleeperPlayer> = {}): SleeperPlayer => ({
  playerId: 'test_player_1',
  firstName: 'Test',
  lastName: 'Player',
  team: 'BUF',
  position: 'QB',
  age: 25,
  yearsExp: 2,
  searchFullName: 'Test Player',
  status: 'Active',
  ...overrides,
})

test('resolveValues dedupes duplicate sleeperId+sourceId keeping better overallRank', () => {
  const players = [minimalPlayer({ playerId: '1234' })]
  const sourceId = 'test_source'
  const values: NormalizedPlayerValue[] = [
    {
      sleeperId: '1234',
      name: 'Test Player',
      team: 'BUF',
      position: 'QB',
      value: 3000,
      overallRank: 10,
      positionRank: 1,
      trend: null,
      tier: null,
    },
    {
      sleeperId: '1234',
      name: 'Test Player',
      team: 'BUF',
      position: 'QB',
      value: 5000,
      overallRank: 5,
      positionRank: 1,
      trend: null,
      tier: null,
    },
  ]

  const { resolved } = resolveValues(sourceId, values, players)

  assert.strictEqual(resolved.length, 1)
  assert.strictEqual(resolved[0].sleeperId, '1234')
  assert.strictEqual(resolved[0].id, `1234:${sourceId}`)
  assert.strictEqual(resolved[0].overallRank, 5)
  assert.strictEqual(resolved[0].value, 5000)
})

test('resolveValues when overallRank ties prefers higher value', () => {
  const players = [minimalPlayer({ playerId: '99' })]
  const sourceId = 'test_source'
  const values: NormalizedPlayerValue[] = [
    {
      sleeperId: '99',
      name: 'Test Player',
      team: 'BUF',
      position: 'QB',
      value: 100,
      overallRank: 3,
      positionRank: null,
      trend: null,
      tier: null,
    },
    {
      sleeperId: '99',
      name: 'Test Player',
      team: 'BUF',
      position: 'QB',
      value: 900,
      overallRank: 3,
      positionRank: null,
      trend: null,
      tier: null,
    },
  ]

  const { resolved } = resolveValues(sourceId, values, players)

  assert.strictEqual(resolved.length, 1)
  assert.strictEqual(resolved[0].value, 900)
})

test('dedupePlayerValuesById keeps first when rank and value tie', () => {
  const now = new Date().toISOString()
  const a = {
    id: 'x:src',
    sleeperId: 'x',
    sourceId: 'src',
    value: 100,
    normalizedValue: 0,
    normalizedValueQm: null,
    overallRank: 1,
    positionRank: null,
    trend: null,
    tierAvg: null,
    tierFc: null,
    tierKtc: null,
    tierDd: null,
    updatedAt: now,
  }
  const b = { ...a, value: 100 }
  const out = dedupePlayerValuesById([a, b])
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0], a)
})
