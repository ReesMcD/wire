# Architecture

## Overview

Fantasy Aggregator is a TanStack Start application that syncs Sleeper league data and aggregates player trade values from multiple sources (FantasyCalc, KeepTradeCut, Dynasty Daddy). Data is persisted in a Neon serverless Postgres database.

## Tech Stack

- **Framework**: TanStack Start (Vite, React)
- **Styling**: Tailwind CSS v4 + shadcn/ui (New York style)
- **Database**: Neon serverless Postgres (`@neondatabase/serverless`)
- **Data Fetching**: TanStack Query, TanStack Table
- **Scraping**: Playwright (KTC, Dynasty Daddy — server-side)
- **Validation**: Zod v4
- **Deployment**: Vercel (Nitro adapter)
- **Package Manager**: pnpm

## Directory Structure

```
app/
├── routes/              # File-based routing (TanStack Router)
│   ├── __root.tsx       # Root layout with nav
│   ├── index.tsx        # Dashboard
│   ├── sync.tsx         # Data sync controls (triggers server-side syncs)
│   ├── rankings.tsx     # Aggregate rankings table
│   └── league.$leagueId.tsx  # League detail / team rosters
├── components/
│   └── ui/              # shadcn/ui components
├── lib/
│   ├── db/              # Zod schemas + Neon connection
│   │   ├── schema.ts    # Zod schemas for all data entities
│   │   └── connection.ts # Neon client factory (reads DATABASE_URL)
│   ├── sources/         # Data source providers
│   │   ├── sleeper/     # Sleeper API client
│   │   ├── fantasycalc/ # FantasyCalc API client
│   │   ├── ktc/         # KTC Playwright scraper
│   │   └── dynasty-daddy/ # Dynasty Daddy CSV scraper
│   ├── players/         # Player identity resolution
│   ├── sync/            # Normalization, quantile matching, tiering
│   └── utils.ts         # Tailwind cn() helper
├── server/
│   └── functions/       # TanStack Start server functions
└── styles/
    └── app.css          # Tailwind entry + CSS variables

scripts/
├── sync.ts              # CLI sync (writes directly to Neon)
├── migrate.ts           # Database migration runner
└── migrations/
    └── 001_initial_schema.sql  # DDL for players, player_values, sync_metadata

tasks/
└── sync.ts              # Nitro scheduled task (cron, writes to Neon)
```

## Key Patterns

### Data Persistence (Neon Postgres)

All application data is stored in Neon serverless Postgres:

- **`players`** — Full Sleeper NFL player database (~10k rows)
- **`player_values`** — Trade values per source, keyed by `{sleeperId}:{sourceId}`
- **`sync_metadata`** — Last sync timestamps and status per source

The Neon HTTP driver (`@neondatabase/serverless`) is used for all database access. It works seamlessly in Vercel serverless functions (no persistent connections needed).

Connection is configured via `DATABASE_URL` environment variable (set in Vercel project settings).

### Sync Pipeline

The sync process writes directly to the database:

1. **Server functions** fetch raw data from external APIs/scrapers.
2. Server normalizes data, runs `resolveValues()` to match against Sleeper players.
3. Resolution includes normalization (0–9999 scale), quantile matching, and tiering.
4. Server persists results directly into Neon via upsert (INSERT ... ON CONFLICT).
5. Frontend can trigger syncs via the `/sync` page, or syncs run on a cron schedule.

Sync can be triggered from:
- **Frontend** — `/sync` page buttons call server functions
- **Cron** — Nitro scheduled task (`tasks/sync.ts`) runs daily at 05:00 UTC
- **CLI** — `pnpm sync` for manual/CI-triggered syncs

### Data Source Provider (Strategy Pattern)

Each external data source implements `DataSourceProvider`:
- `id` / `name` / `type` for identification
- `fetch()` to retrieve raw data
- `normalize()` to convert to `NormalizedPlayerValue[]`

Adding a new source: implement the interface, register it, add a server function.

### Player Identity (Sleeper ID as canonical key)

All player data is keyed by Sleeper player ID. The `PlayerMatcher` resolves incoming data:
1. Direct `sleeperId` match (FantasyCalc provides this natively)
2. Composite key: normalized(name) + team + position
3. Fuzzy: stripped suffixes, collapsed punctuation
4. Unresolved: logged for review

### Value Normalization & Tiering

- Raw values from each source are normalized to a 0–9999 scale (max value = 9999).
- Quantile matching aligns non-KTC sources to KTC's empirical distribution per format lane.
- Tiering uses a gap-threshold algorithm in `app/lib/sync/tiering.ts`.
- Per-source tiers (tierFc, tierKtc, tierDd) and an average tier (tierAvg) are computed.

### Server Functions

Server functions handle all external I/O and persistence:
- `syncSleeperPlayers` — Fetch all NFL players → upsert to `players` table
- `syncSleeperLeague` — Fetch league + rosters + users (live, not persisted)
- `syncFantasyCalc` — Fetch from api.fantasycalc.com → merge + upsert to `player_values`
- `syncKtc` — Playwright scrape keeptradecut.com → merge + upsert to `player_values`
- `syncDynastyDaddy` — Fetch CSV → merge + upsert to `player_values`
- `readPlayers` / `readValues` / `readSyncMetadata` — SELECT from Neon

### Client-Side Storage (UI preferences only)

- `localStorage` — League ID, last fetch timestamp, column visibility, UI settings (Zustand persist)
- No application data is stored client-side; all reads go through server functions → Neon

## External APIs

### Sleeper (docs.sleeper.com)
- No auth required, read-only
- Rate limit: 1000 calls/min
- `GET /v1/players/nfl` — All players (~5MB JSON)
- `GET /v1/league/{id}` — League info
- `GET /v1/league/{id}/rosters` — Rosters
- `GET /v1/league/{id}/users` — Users

### FantasyCalc (api.fantasycalc.com)
- No auth required
- `GET /values/current?isDynasty=false&numQbs=1&numTeams=12&ppr=1`
- Returns array with `player.sleeperId` for direct mapping
- Params: isDynasty, numQbs, numTeams, ppr

### KeepTradeCut (keeptradecut.com)
- No API available, requires Playwright scraping
- Scrapes `/fantasy-rankings` page
- Player matching via name/team composite key

### Dynasty Daddy
- CSV download via Playwright
- Dynasty and ADP/redraft rankings
- Player matching via name normalization
