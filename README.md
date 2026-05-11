# Fantasy Aggregator

A fantasy football data aggregator and analysis tool built with TanStack Start, deployed on Vercel. Syncs your Sleeper league and displays aggregated player trade values from FantasyCalc, KeepTradeCut, and Dynasty Daddy side-by-side. All data is stored in Neon serverless Postgres.

## Prerequisites

- **Node.js** 20.19+ or 22+ recommended
- **pnpm** (package manager)
- **Neon Postgres database** ([neon.tech](https://neon.tech))
- **Chromium** (only needed for KTC / Dynasty Daddy scraping)

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up the database

Create a Neon project at [neon.tech](https://neon.tech) and copy the pooled connection string.

```bash
cp .env.example .env.local
# Edit .env.local and set DATABASE_URL to your Neon connection string
```

Run the migration to create tables:

```bash
DATABASE_URL=postgres://... pnpm migrate
```

### 3. Install Playwright browsers (optional, for KTC/DD scraping)

```bash
npx playwright install chromium
```

### 4. Start the dev server

```bash
pnpm dev
```

The app will be available at **http://localhost:3000**.

### 5. Seed initial data

Run the full sync to populate your database:

```bash
DATABASE_URL=postgres://... pnpm sync
```

Or use the UI:

1. Navigate to **Sync** (`/sync`)
2. Click **"Sync players"** — loads the full Sleeper NFL player database (~10k players)
3. Click **"Sync FantasyCalc"** to fetch current player trade values
4. (Optional) Click **"Sync KTC"** / **"Sync Dynasty Daddy"** for additional sources

## Finding Your Sleeper League ID

Open the Sleeper app or website, go to your league, and look at the URL:
```
https://sleeper.com/leagues/123456789012345678
                              ^^^^^^^^^^^^^^^^^^ this is your league ID
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server on port 3000 |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm preview` | Preview production build locally |
| `pnpm sync` | Run full sync (all sources → Neon) |
| `pnpm migrate` | Apply database migrations |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon Postgres pooled connection string |

Set in:
- **Vercel**: Project Settings → Environment Variables (Production + Preview + Development)
- **Local**: `.env.local` at repo root
- **CI**: Pipeline secrets

## Features

- **League Sync** — Pull your Sleeper league rosters, teams, and standings
- **Multi-source Values** — Aggregate trade values from FantasyCalc, KeepTradeCut, and Dynasty Daddy
- **Rankings Table** — Sort by any value source, filter by position, search by name
- **Team Rosters** — View each team's players with values from all sources and team totals
- **Manual Sync** — Trigger each data source independently from the UI
- **Scheduled Sync** — Cron job runs daily to keep data fresh
- **Serverless Storage** — All data in Neon Postgres (no filesystem dependency)

## Data Sources

| Source | Method | Mapping | Notes |
|--------|--------|---------|-------|
| [Sleeper](https://docs.sleeper.com/) | REST API | Canonical player IDs | No auth, rate limit 1000/min |
| [FantasyCalc](https://fantasycalc.com) | REST API | Provides `sleeperId` directly | Supports dynasty/redraft, SF, PPR |
| [KeepTradeCut](https://keeptradecut.com) | Playwright scrape | Name + team matching | Requires Chromium installed |
| [Dynasty Daddy](https://dynastydaddy.com) | Playwright CSV | Name matching | Dynasty + ADP/redraft |

## Architecture

```
app/
├── routes/              # TanStack Router file-based routes
├── components/ui/       # shadcn/ui components
├── lib/
│   ├── db/              # Neon connection + Zod schemas
│   ├── sources/         # Data source providers (sleeper, fantasycalc, ktc, dynasty-daddy)
│   ├── sync/            # Normalization, quantile matching, tiering
│   └── players/         # Player identity resolution (PlayerMatcher)
├── server/functions/    # TanStack Start server functions (read + write to Neon)
└── styles/              # Tailwind CSS entry

scripts/
├── sync.ts              # CLI full sync
├── migrate.ts           # Migration runner
└── migrations/          # SQL DDL files

tasks/
└── sync.ts              # Nitro scheduled task (daily cron)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture reference.

## Adding a New Data Source

1. Create `app/lib/sources/{name}/types.ts` — Raw API response types
2. Create `app/lib/sources/{name}/client.ts` — API client or scraper
3. Create `app/lib/sources/{name}/provider.ts` — Implements `DataSourceProvider` interface
4. Create `app/server/functions/sync-{name}.ts` — Server function that fetches + writes to Neon
5. Add a sync card in `app/routes/sync.tsx`

The `PlayerMatcher` handles resolving players to Sleeper IDs automatically. If the source provides a `sleeperId`, mapping is instant. Otherwise, it falls back to name + team + position matching.

## Player Matching

All player data is keyed by **Sleeper player ID** as the canonical identifier.

| Strategy | Confidence | Used When |
|----------|-----------|-----------|
| Direct `sleeperId` | Exact | Source provides Sleeper ID (e.g., FantasyCalc) |
| Name + Team + Position | High | Composite key matches Sleeper DB |
| Fuzzy (stripped suffixes) | Low | Handles Jr., III, hyphens, apostrophes |
| Unresolved | — | Logged for review |

## Tech Stack

- **[TanStack Start](https://tanstack.com/start)** — Full-stack React framework
- **[TanStack Router](https://tanstack.com/router)** — Type-safe file-based routing
- **[TanStack Table](https://tanstack.com/table)** — Headless table with sorting/filtering
- **[Neon](https://neon.tech)** — Serverless Postgres database
- **[Tailwind CSS v4](https://tailwindcss.com)** — Utility-first styling
- **[shadcn/ui](https://ui.shadcn.com)** — Component library (New York variant)
- **[Zod v4](https://zod.dev)** — Schema validation
- **[Playwright](https://playwright.dev)** — Browser automation (KTC/DD scraping)
- **[Vite](https://vite.dev)** — Build tool
- **[Vercel](https://vercel.com)** — Deployment platform
- **[pnpm](https://pnpm.io)** — Package manager

## Deployment

The app deploys to Vercel via the Nitro adapter. Configuration is in `vercel.json` and `vite.config.ts`.

Required Vercel setup:
1. Add `DATABASE_URL` to Project Settings → Environment Variables
2. Deploy (Vercel auto-detects the build command from `vercel.json`)
3. Run initial sync: `DATABASE_URL=postgres://... pnpm sync`

The scheduled sync task (`tasks/sync.ts`) runs daily at 05:00 UTC via Nitro's task scheduler.

## License

ISC
