import type { FantasyCalcConfig, FantasyCalcEntry } from './types'

const BASE_URL = 'https://api.fantasycalc.com/values/current'

export async function fetchFantasyCalcValues(
  config: FantasyCalcConfig = { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1 },
): Promise<FantasyCalcEntry[]> {
  const params = new URLSearchParams({
    isDynasty: String(config.isDynasty),
    numQbs: String(config.numQbs),
    numTeams: String(config.numTeams),
    ppr: String(config.ppr),
  })

  console.log(`[FantasyCalc] Fetching values: ${BASE_URL}?${params}`)

  const response = await fetch(`${BASE_URL}?${params}`)
  if (!response.ok) {
    throw new Error(`FantasyCalc API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as FantasyCalcEntry[]
  console.log(`[FantasyCalc] Received ${data.length} players`)

  return data
}
