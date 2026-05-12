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

Create a Neon project at [neon.tech](https://neon.tech) and copy the **pooled** connection string.

```bash
cp .env.example .env.local
```

In `.env.local`, search for **`REPLACE_ME_NEON_`** and replace the placeholder with your full Neon URL (starts with `postgres://`).

Run the migration to create tables:

```bash
pnpm migrate
```

If you prefer not to use `.env.local`, set `DATABASE_URL` in the shell or prefix the command.

### 3. Install Playwright browsers (optional, for KTC/DD scraping)

```bash
npx playwright install chromium
```

### 4. Start the dev server

```bash
pnpm dev
```

The app will be available at **http://localhost:3000**. With `.env.local` present, **Vite loads it for `pnpm dev`**, so server functions and the UI receive **`DATABASE_URL`** without exporting it in the shell.

### 5. Seed initial data

Run the full sync to populate your database:

```bash
pnpm sync
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
- **Local**: `.env.local` at repo root (copy from `.env.example`, replace `REPLACE_ME_NEON_DATABASE_URL`)
- **CI**: Pipeline secrets

**Local behavior:**

- **`pnpm dev`** — Vite loads `.env.local`, so **`DATABASE_URL`** is available to TanStack Start server functions and the app.
- **`pnpm migrate`** / **`pnpm sync`** — These scripts load **`.env.local`** from the repo root when **`DATABASE_URL`** is not already set in the environment. You can still override with `export DATABASE_URL=...` or `DATABASE_URL='...' pnpm migrate`.

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

### Vercel checklist

1. In **Neon**, create a project and copy the **pooled** connection string (host often includes `-pooler`).
2. In **Vercel** → your project → **Settings** → **Environment Variables**, add **`DATABASE_URL`** with that string.
3. Enable it for **Production** and **Preview** (and **Development** if you use Vercel’s dev integration).
4. **Redeploy** (or push a commit) so serverless functions and Nitro pick up the new variable.
5. **First-time database**: from your machine, run **`pnpm migrate`** against the same URL (see [Getting Started](#2-set-up-the-database)), then **Sync** in the app or **`pnpm sync`**.

### Daily scheduled sync (cron)

Nitro runs the same full sync as **`pnpm sync`** via [`tasks/sync.ts`](tasks/sync.ts). On Vercel, a **cron job** calls Nitro’s handler at **`/_vercel/cron`** once per day (**`0 5 * * *`** UTC — see `scheduledTasks` in [`vite.config.ts`](vite.config.ts)). That schedule is written into **`.vercel/output/config.json`** at build time when Vercel builds the project (do **not** duplicate it in root `vercel.json` unless you know you need to; two identical crons can double-invoke).

**What you do in Vercel**

1. **Production deploy** — Push or deploy so a **Production** build completes. Preview-only deploys do not drive production crons.
2. **`DATABASE_URL`** — Under **Settings → Environment Variables**, set your Neon pooled URL for **Production** (required). Cron invocations hit the production deployment only.
3. **Optional `CRON_SECRET`** — Add a long random value (16+ characters) for **Production**. Vercel sends it as `Authorization: Bearer <secret>` on cron requests; the handler rejects missing or wrong values when this env var is set.
4. **Confirm the cron** — **Settings → [Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs#viewing-cron-jobs)**. You should see one job: path **`/_vercel/cron`**, schedule **`0 5 * * *`**. If it is missing, trigger a fresh **Production** redeploy from the same repo (the Nitro+Vercel build must run on Vercel’s builders so `VERCEL` is set).
5. **Hobby plan** — Daily crons are allowed; Vercel may run yours **any time within the 05:00–05:59 UTC window** (not necessarily 05:00 sharp). See [Cron jobs accuracy](https://vercel.com/docs/cron-jobs/manage-cron-jobs#cron-jobs-accuracy).
6. **Timeouts** — The project sets **`maxDuration` 300s** for the serverless bundle and **`/_vercel/cron`** so Playwright-backed sources can finish.
7. **Verify a run** — After the first scheduled time (or use **Runtime Logs** with path `/_vercel/cron`), look for **`=== Fantasy Sync Task ===`** / **`=== Sync Task Complete ===`** or errors. Cron does not auto-retry on failure.
8. **Manual refresh** — Use the in-app **Sync** page anytime; you cannot fully simulate Vercel’s cron locally with `vercel dev` ([limitations](https://vercel.com/docs/cron-jobs/manage-cron-jobs#running-cron-jobs-locally)).

Optional: use a separate Neon branch for Preview vs Production if you want isolated preview databases.

## License

ISC
