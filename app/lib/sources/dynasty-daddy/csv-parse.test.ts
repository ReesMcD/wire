import assert from 'node:assert'
import { test } from 'node:test'
import { parseDynastyDaddyCsv } from './csv-parse'

test('parseDynastyDaddyCsv reads Dynasty Daddy value column', () => {
  const sample = `Player Values for 2026-05-07 - Superflex

rank,full_name,team,injury_status,position,age,points,avg_adp,trend,Dynasty Daddy,90D Peak
1,Bijan Robinson,ATL,,RB,24,366.8,1,0,10200,high
14,2026 Pick 1.01,FA,,PI,,0,0,4,7819,
`
  const rows = parseDynastyDaddyCsv(sample)
  assert.strictEqual(rows.length, 2)
  assert.strictEqual(rows[0].fullName, 'Bijan Robinson')
  assert.strictEqual(rows[0].value, 10200)
  assert.strictEqual(rows[0].trend, 0)
  assert.strictEqual(rows[1].fullName, '2026 Pick 1.01')
  assert.strictEqual(rows[1].value, 7819)
})

test('parseDynastyDaddyCsv reads ADP Daddy value column', () => {
  const sample = `Player Values for 2026-05-07 - Superflex

rank,full_name,team,injury_status,position,age,points,avg_adp,trend,ADP Daddy,90D Peak
1,Bijan Robinson,ATL,,RB,24,366.8,1,13,10037,
`
  const rows = parseDynastyDaddyCsv(sample)
  assert.strictEqual(rows[0].value, 10037)
})
