import { neon } from '@neondatabase/serverless'

/**
 * Returns a Neon SQL tagged-template client bound to DATABASE_URL.
 *
 * ─── SECRETS REQUIRED ───
 * Environment variable: DATABASE_URL
 * Value: Your Neon Postgres connection string (pooled endpoint recommended).
 * Format: postgres://<user>:<password>@<host>/<database>?sslmode=require
 *
 * Add this in:
 *   • Vercel → Project Settings → Environment Variables
 *   • Cursor Cloud Agents → Secrets (if running agents locally)
 *   • .env.local for local dev (never commit this file)
 * ────────────────────────
 */
export function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      '[DB] DATABASE_URL is not set. ' +
        'Add it to Vercel Environment Variables or .env.local for local dev.',
    )
  }
  return neon(url)
}
