import type { KtcRawPlayer } from './types'

export type KtcRankingMode = 'dynasty' | 'redraft'

export async function scrapeKtcRankings(
  format: '1qb' | '2qb' = '2qb',
  rankingMode: KtcRankingMode = 'dynasty',
): Promise<KtcRawPlayer[]> {
  const { chromium } = await import('playwright')

  const modeLabel = rankingMode === 'dynasty' ? 'dynasty' : 'redraft'
  console.log(`[KTC] Launching browser (${modeLabel})...`)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    const allPlayers: KtcRawPlayer[] = []
    let pageNum = 0
    const formatParam = format === '2qb' ? '2' : '1'
    const basePath =
      rankingMode === 'dynasty'
        ? 'dynasty-rankings'
        : 'fantasy-rankings'
    const filters =
      rankingMode === 'dynasty'
        ? 'QB|WR|RB|TE|RDP'
        : 'QB|WR|RB|TE|DST|PK'

    while (true) {
      const url = `https://keeptradecut.com/${basePath}?page=${pageNum}&filters=${filters}&format=${formatParam}`
      console.log(`[KTC] [${modeLabel}] Loading page ${pageNum}: ${url}`)

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForSelector('.single-ranking', { timeout: 15000 }).catch(() => null)
      await page.waitForTimeout(2000)

      const rows = await page.locator('.single-ranking').all()
      console.log(`[KTC] Page ${pageNum}: found ${rows.length} ranking rows`)

      if (rows.length === 0) {
        console.log(`[KTC] No rows on page ${pageNum}, scraping complete`)
        break
      }

      const pageData = await page.evaluate(() => {
        const results: Array<{
          name: string
          team: string
          position: string
          value: number
          tier: string
          trend: string
          rank: string
        }> = []

        const rankings = document.querySelectorAll('.single-ranking')
        rankings.forEach((row) => {
          const nameEl = row.querySelector('.player-name a')
          const teamEl = row.querySelector('.player-name .player-team')
          const posEl = row.querySelector('.position-team .position')
          const valueEl = row.querySelector('.value p')
          const tierEl = row.querySelector('.player-tier .position')
          const trendEl = row.querySelector('.trend p')
          const rankEl = row.querySelector('.rank-number p')

          const name = nameEl?.textContent?.trim() ?? ''
          const team = teamEl?.textContent?.trim() ?? ''
          const position = posEl?.textContent?.trim() ?? ''
          const valueText = valueEl?.textContent?.trim() ?? '0'
          const tier = tierEl?.textContent?.trim() ?? ''
          const trend = trendEl?.textContent?.trim() ?? '0'
          const rank = rankEl?.textContent?.trim() ?? '0'

          if (name) {
            results.push({ name, team, position, value: parseInt(valueText, 10) || 0, tier, trend, rank })
          }
        })

        return results
      })

      let parsedCount = 0
      for (const entry of pageData) {
        if (!entry.name || entry.value === 0) continue

        const parsed = parseEntry(entry)
        if (parsed) {
          allPlayers.push(parsed)
          parsedCount++
        }
      }

      console.log(`[KTC] Page ${pageNum}: parsed ${parsedCount} of ${pageData.length} rows`)

      if (parsedCount > 0 && allPlayers.length > 0) {
        const last = allPlayers[allPlayers.length - 1]
        console.log(`[KTC] Last parsed: ${last.playerName} (${last.position}, ${last.team}) = ${last.value}`)
      }

      pageNum++
      if (pageNum > 20) {
        console.log('[KTC] Safety limit: stopped at 20 pages')
        break
      }
    }

    const positionCounters: Record<string, number> = {}
    for (let i = 0; i < allPlayers.length; i++) {
      allPlayers[i].overallRank = i + 1
      const posKey = allPlayers[i].position || 'UNKNOWN'
      positionCounters[posKey] = (positionCounters[posKey] || 0) + 1
      allPlayers[i].positionRank = positionCounters[posKey]
    }

    console.log(`[KTC] Total: ${allPlayers.length} players/picks scraped`)
    if (allPlayers.length > 0) {
      const top5 = allPlayers.slice(0, 5)
      console.log('[KTC] Top 5:', top5.map(p => `${p.playerName} (${p.position}, ${p.team}) = ${p.value}`))
    }

    return allPlayers
  } catch (error) {
    console.error('[KTC] Scraper error:', error instanceof Error ? error.message : error)
    throw error
  } finally {
    console.log('[KTC] Closing browser')
    await browser.close()
  }
}

interface RawEntry {
  name: string
  team: string
  position: string
  value: number
  tier: string
  trend: string
  rank: string
}

function parseEntry(entry: RawEntry): KtcRawPlayer | null {
  const pickMatch = entry.name.match(/^(\d{4})\s+(Early|Mid|Late)\s+(\d+)\w{2}$/)
  if (pickMatch) {
    const [, year, tier, round] = pickMatch
    const tierNum = parseTierNumber(entry.tier)

    return {
      playerName: entry.name,
      position: 'PICK',
      team: null,
      value: entry.value,
      overallRank: 0,
      positionRank: 0,
      trend: parseTrend(entry.trend),
      tier: tierNum,
      pickData: {
        year: parseInt(year, 10),
        round: parseInt(round, 10),
        tier: tier.toLowerCase() as 'early' | 'mid' | 'late',
      },
    }
  }

  const position = entry.position.replace(/\d+/g, '')
  const tierNum = parseTierNumber(entry.tier)

  return {
    playerName: entry.name,
    position,
    team: entry.team || null,
    value: entry.value,
    overallRank: 0,
    positionRank: 0,
    trend: parseTrend(entry.trend),
    tier: tierNum,
    pickData: null,
  }
}

function parseTierNumber(tierText: string): number | null {
  const match = tierText.match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}

function parseTrend(trendText: string): number | null {
  const val = parseInt(trendText, 10)
  return isNaN(val) ? null : val
}
