/**
 * Map Dynasty Daddy CSV pick names to internal `pick:year:round:tier` ids
 * (aligned with FantasyCalc / KTC conventions).
 */
export function parseDdPickSleeperId(fullName: string, position: string | null): string | null {
  const pos = (position ?? '').trim().toUpperCase()
  if (pos !== 'PI' && pos !== 'PICK') return null

  const n = fullName.trim()

  const earlyMidLate = n.match(/^(\d{4})\s+(Early|Mid|Late)\s+(\d+)(?:st|nd|rd|th)$/i)
  if (earlyMidLate) {
    const year = earlyMidLate[1]
    const tier = earlyMidLate[2].toLowerCase() as 'early' | 'mid' | 'late'
    const round = parseInt(earlyMidLate[3], 10)
    if (!Number.isFinite(round)) return null
    return `pick:${year}:${round}:${tier}`
  }

  const pickSlot = n.match(/^(\d{4})\s+Pick\s+(\d+)\.(\d+)$/i)
  if (pickSlot) {
    const year = pickSlot[1]
    const round = parseInt(pickSlot[2], 10)
    const slot = parseInt(pickSlot[3], 10)
    if (!Number.isFinite(round) || !Number.isFinite(slot)) return null
    const tier: 'early' | 'mid' | 'late' = slot <= 4 ? 'early' : slot <= 8 ? 'mid' : 'late'
    return `pick:${year}:${round}:${tier}`
  }

  return null
}
