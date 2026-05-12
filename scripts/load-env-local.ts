import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

/**
 * Repo root: this file lives at `<root>/scripts/load-env-local.ts`.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Load `.env.local` into `process.env` for CLI scripts (`pnpm migrate`, `pnpm sync`).
 * Does not override keys already set in the environment.
 *
 * Reads, in order (same path deduped): `<repo>/.env.local`, then `cwd/.env.local`
 * so `pnpm sync` works even when the shell cwd is not the repo root.
 */
export function loadEnvLocalFromCwd(): void {
  const cwdFile = resolve(process.cwd(), '.env.local')
  const repoFile = resolve(REPO_ROOT, '.env.local')
  const paths = repoFile === cwdFile ? [repoFile] : [repoFile, cwdFile]
  for (const p of paths) {
    if (!existsSync(p)) continue
    applyEnvLocalFile(p)
  }
}

function applyEnvLocalFile(p: string): void {
  let raw = readFileSync(p, 'utf-8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    let key = trimmed.slice(0, eq).trim()
    if (/^export\s+/i.test(key)) key = key.replace(/^export\s+/i, '').trim()
    if (!key) continue
    if (process.env[key] !== undefined) continue
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}
