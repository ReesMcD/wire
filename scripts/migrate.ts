/**
 * Run database migrations against Neon.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm tsx scripts/migrate.ts
 *
 * ─── SECRETS REQUIRED ───
 * DATABASE_URL — your Neon pooled connection string
 * ────────────────────────
 */
import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { neon } from '@neondatabase/serverless'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('ERROR: DATABASE_URL environment variable is not set.')
    console.error('Set it to your Neon connection string before running migrations.')
    process.exit(1)
  }

  const sql = neon(url)
  const migrationPath = resolve(__dirname, 'migrations/001_initial_schema.sql')
  const migration = await readFile(migrationPath, 'utf-8')

  console.log('[migrate] Running 001_initial_schema.sql...')
  await sql.query(migration)
  console.log('[migrate] Done. Tables created successfully.')
}

main().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
