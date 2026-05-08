const SUFFIXES = /\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i
const PUNCTUATION = /['\-\.]/g
const WHITESPACE = /\s+/g

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(SUFFIXES, '')
    .replace(PUNCTUATION, '')
    .replace(WHITESPACE, '')
    .trim()
}

export function normalizeTeam(team: string | null | undefined): string {
  if (!team) return ''
  return team.toUpperCase().trim()
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

export function buildCompositeKey(
  firstName: string,
  lastName: string,
  team: string | null | undefined,
  position: string | null | undefined,
): string {
  const normalizedFirst = normalizeName(firstName)
  const normalizedLast = normalizeName(lastName)
  const normalizedTeam = normalizeTeam(team)
  const normalizedPos = (position ?? '').toUpperCase()
  return `${normalizedLast}:${normalizedFirst}:${normalizedTeam}:${normalizedPos}`
}

export function buildFuzzyKey(firstName: string, lastName: string): string {
  return `${normalizeName(lastName)}:${normalizeName(firstName)}`
}
