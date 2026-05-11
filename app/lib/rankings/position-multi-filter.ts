/** Tags shown in multi-select position filters (QB–TE + draft picks). */
export const POSITION_MULTI_TAGS = ['QB', 'RB', 'WR', 'TE', 'PICK'] as const

export type PositionMultiTag = (typeof POSITION_MULTI_TAGS)[number]

export function passesPositionMultiFilter(
  row: { position: string | null; sleeperId: string },
  selected: readonly string[],
  hidePickRows: boolean,
): boolean {
  if (hidePickRows && (row.position === 'PICK' || row.sleeperId.startsWith('pick:'))) return false
  if (selected.length === 0) return true
  const isPick = row.position === 'PICK' || row.sleeperId.startsWith('pick:')
  const tag = isPick ? 'PICK' : row.position
  if (!tag) return false
  return selected.includes(tag)
}

export function togglePositionTag(selected: readonly string[], tag: string): string[] {
  if (selected.includes(tag)) return selected.filter((x) => x !== tag)
  return [...selected, tag].sort()
}
