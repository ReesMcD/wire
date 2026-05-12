/**
 * Run database migrations against Neon.
 *
 * Usage:
 *   pnpm migrate
 *
 * Loads `.env.local` from the repo root when `DATABASE_URL` is not already set.
 *
 * ─── SECRETS REQUIRED ───
 * DATABASE_URL — your Neon pooled connection string (in `.env.local` or env)
 * ────────────────────────
 */
import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { neon } from '@neondatabase/serverless'
import { loadEnvLocalFromCwd } from './load-env-local'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  loadEnvLocalFromCwd()
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('ERROR: DATABASE_URL environment variable is not set.')
    console.error('Set it to your Neon connection string before running migrations.')
    process.exit(1)
  }

  const sql = neon(url)
  const migrationPath = resolve(__dirname, 'migrations/001_initial_schema.sql')
  const migration = await readFile(migrationPath, 'utf-8')

  /** Neon serverless `query()` does not accept multiple statements in one call. */
  const statements = migration
    .split(';')
    .map((s) =>
      s
        .split('\n')
        .filter((line) => {
          const t = line.trim()
          return t.length > 0 && !t.startsWith('--')
        })
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0)
    .filter((s) => !/^(begin|commit)$/i.test(s))

  console.log('[migrate] Running 001_initial_schema.sql...')
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    console.log(`[migrate] Statement ${i + 1}/${statements.length}…`)
    await sql.query(stmt)
  }
  console.log('[migrate] Done. Tables created successfully.')
}

main().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
