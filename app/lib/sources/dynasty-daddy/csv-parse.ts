import type { DynastyDaddyCsvRow } from './types'

/** Split a CSV line respecting quoted fields */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === ',') {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function findHeaderLine(lines: string[]): { idx: number; cells: string[] } | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cells = parseCsvLine(line)
    if (cells[0]?.toLowerCase() === 'rank' && cells.includes('full_name')) {
      return { idx: i, cells }
    }
  }
  return null
}

/**
 * Value column is labeled `Dynasty Daddy` or `ADP Daddy` in exports.
 */
function valueColumnIndex(header: string[]): number {
  const dyn = header.findIndex((h) => h === 'Dynasty Daddy')
  if (dyn >= 0) return dyn
  const adp = header.findIndex((h) => h === 'ADP Daddy')
  if (adp >= 0) return adp
  throw new Error(
    `Dynasty Daddy CSV: expected value column "Dynasty Daddy" or "ADP Daddy", got: ${header.join(',')}`,
  )
}

export function parseDynastyDaddyCsv(text: string): DynastyDaddyCsvRow[] {
  const lines = text.split(/\r?\n/)
  const found = findHeaderLine(lines)
  if (!found) {
    throw new Error('Dynasty Daddy CSV: no header row starting with rank,full_name')
  }

  const { cells: header } = found
  const idxRank = header.indexOf('rank')
  const idxName = header.indexOf('full_name')
  const idxTeam = header.indexOf('team')
  const idxPos = header.indexOf('position')
  const idxTrend = header.indexOf('trend')
  const idxValue = valueColumnIndex(header)

  if (idxRank < 0 || idxName < 0) {
    throw new Error('Dynasty Daddy CSV: missing rank or full_name column')
  }

  const rows: DynastyDaddyCsvRow[] = []
  for (let i = found.idx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    let cells = parseCsvLine(line)
    while (cells.length < header.length) cells.push('')
    if (cells.length > header.length) cells = cells.slice(0, header.length)

    const rank = parseInt(cells[idxRank] ?? '', 10)
    const fullName = cells[idxName] ?? ''
    const value = parseFloat(cells[idxValue] ?? '')
    if (!fullName || !Number.isFinite(value) || !Number.isFinite(rank)) continue

    const trendRaw = cells[idxTrend]
    const trendParsed = trendRaw !== undefined && trendRaw !== '' ? parseInt(trendRaw, 10) : NaN

    rows.push({
      rank,
      fullName: fullName,
      team: idxTeam >= 0 ? (cells[idxTeam] || null) : null,
      position: idxPos >= 0 ? (cells[idxPos] || null) : null,
      value: Math.round(value),
      trend: Number.isFinite(trendParsed) ? trendParsed : null,
    })
  }

  return rows
}
