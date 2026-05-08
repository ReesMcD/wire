import assert from 'node:assert'
import { test } from 'node:test'
import { parseDdPickSleeperId } from './pick-id'

test('parseDdPickSleeperId Early 1st', () => {
  assert.strictEqual(parseDdPickSleeperId('2026 Early 1st', 'PI'), 'pick:2026:1:early')
})

test('parseDdPickSleeperId Pick slot maps to tier bucket', () => {
  assert.strictEqual(parseDdPickSleeperId('2026 Pick 1.01', 'PI'), 'pick:2026:1:early')
  assert.strictEqual(parseDdPickSleeperId('2026 Pick 1.06', 'PI'), 'pick:2026:1:mid')
})

test('parseDdPickSleeperId returns null for players', () => {
  assert.strictEqual(parseDdPickSleeperId('Bijan Robinson', 'RB'), null)
})
