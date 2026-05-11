/** Tailwind classes for tier badges: stable per tier, no consecutive tiers share the same swatch. */
const SWATCHES = [
  'border border-sky-600/35 bg-sky-500/18 text-sky-950 dark:text-sky-50',
  'border border-amber-600/35 bg-amber-500/18 text-amber-950 dark:text-amber-50',
  'border border-violet-600/35 bg-violet-500/18 text-violet-950 dark:text-violet-50',
  'border border-emerald-600/35 bg-emerald-500/18 text-emerald-950 dark:text-emerald-50',
  'border border-rose-600/35 bg-rose-500/18 text-rose-950 dark:text-rose-50',
  'border border-cyan-600/35 bg-cyan-500/18 text-cyan-950 dark:text-cyan-50',
] as const

const TIER_TO_SWATCH: number[] = (() => {
  const L = SWATCHES.length
  const out: number[] = [0]
  let prev = 0
  for (let n = 2; n <= 48; n++) {
    let idx = (n - 1) % L
    if (idx === prev) idx = (idx + 1) % L
    out.push(idx)
    prev = idx
  }
  return out
})()

export function tierBadgeClass(tier: number | null | undefined): string {
  if (tier == null || !Number.isFinite(tier)) return 'border border-border bg-muted/60 text-muted-foreground'
  const n = Math.max(1, Math.min(48, Math.floor(tier)))
  return SWATCHES[TIER_TO_SWATCH[n - 1] ?? 0]
}
