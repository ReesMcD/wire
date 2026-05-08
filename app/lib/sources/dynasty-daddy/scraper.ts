import type { DynastyDaddyRankingMode } from './types'
import { parseDynastyDaddyCsv } from './csv-parse'
import type { DynastyDaddyCsvRow } from './types'

const RANKINGS_URL = 'https://dynasty-daddy.com/fantasy-rankings'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Playwright: open rankings, switch Fantasy Market source, download CSV.
 * - dynasty → mat-option index 0 (Dynasty Daddy)
 * - redraft → mat-option index 1 (ADP Daddy), treated as the site’s redraft/ADP lane
 */
export async function scrapeDynastyDaddyCsv(rankingMode: DynastyDaddyRankingMode): Promise<DynastyDaddyCsvRow[]> {
  const { chromium } = await import('playwright')

  const label = rankingMode === 'dynasty' ? 'dynasty' : 'adp_redraft'
  console.log(`[DD] Launching browser (${label})...`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(RANKINGS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('mat-select', { timeout: 30000 })
    await sleep(2500)

    await page.locator('mat-select').first().click()
    await sleep(600)

    const optionIndex = rankingMode === 'dynasty' ? 0 : 1
    await page.locator('mat-option').nth(optionIndex).click()
    await sleep(3500)

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    await page.locator('button.download').first().click()
    const download = await downloadPromise

    const path = await download.path()
    if (!path) {
      throw new Error('[DD] Download did not produce a file path')
    }

    const { readFile } = await import('fs/promises')
    const text = await readFile(path, 'utf-8')
    const rows = parseDynastyDaddyCsv(text)
    console.log(`[DD] Parsed ${rows.length} rows (${label})`)
    return rows
  } finally {
    await browser.close()
  }
}
