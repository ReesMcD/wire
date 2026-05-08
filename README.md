# Fantasy Aggregator

A fantasy football data aggregator and analysis tool built with TanStack Start. Syncs your Sleeper league and displays aggregated player trade values from FantasyCalc and KeepTradeCut side-by-side.

## Prerequisites

- **Node.js** 20.19+ or 22+ recommended
- **pnpm** (package manager)
- **Chromium** (only needed for KeepTradeCut scraping)

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Install Playwright browsers (optional, for KTC scraping)

```bash
npx playwright install chromium
```

### 3. Start the dev server

```bash
pnpm dev
```

The app will be available at **http://localhost:3000**.

### 4. First-time setup workflow

Once the app is running:

1. Navigate to **Sync** (`/sync`)
2. Click **"Sync Player Database"** — this loads the full Sleeper NFL player database (~10k players). Required before any other sync.
3. Enter your **Sleeper league ID** and click Sync to pull your league rosters and teams.
4. Click **"Sync FantasyCalc"** to fetch current player trade values.
5. (Optional) Click **"Sync KTC"** to scrape KeepTradeCut values.

You're done. Navigate to **Rankings** or click your league on the **Dashboard** to explore.

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

## Features

- **League Sync** — Pull your Sleeper league rosters, teams, and standings
- **Multi-source Values** — Aggregate trade values from FantasyCalc and KeepTradeCut
- **Rankings Table** — Sort by any value source, filter by position, search by name
- **Team Rosters** — View each team's players with values from both sources and team totals
- **Manual Sync** — Trigger each data source independently with status tracking
- **Persistent Storage** — All data stored in browser localStorage via TanStack DB (persists across sessions)

## Data Sources

| Source | Method | Mapping | Notes |
|--------|--------|---------|-------|
| [Sleeper](https://docs.sleeper.com/) | REST API | Canonical player IDs | No auth, rate limit 1000/min |
| [FantasyCalc](https://fantasycalc.com) | REST API | Provides `sleeperId` directly | Supports dynasty/redraft, SF, PPR |
| [KeepTradeCut](https://keeptradecut.com) | Playwright scrape | Name + team matching | Requires Chromium installed |

### FantasyCalc API

The app hits the following endpoint:
```
GET https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&numTeams=12&ppr=1
```

Parameters:
- `isDynasty` — `true` for dynasty values, `false` for redraft
- `numQbs` — `1` for standard, `2` for superflex
- `numTeams` — League size (10, 12, 14)
- `ppr` — PPR scoring (0, 0.5, 1)

## Architecture

```
app/
├── routes/              # TanStack Router file-based routes
├── components/ui/       # shadcn/ui components
├── lib/
│   ├── db/              # TanStack DB collections + Zod schemas
│   ├── sources/         # Data source providers (sleeper, fantasycalc, ktc)
│   └── players/         # Player identity resolution (PlayerMatcher)
├── server/functions/    # TanStack Start server functions
└── styles/              # Tailwind CSS entry
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture reference.

## Adding a New Data Source

The project uses a plugin-based architecture. To add a new source:

1. Create `app/lib/sources/{name}/types.ts` — Raw API response types
2. Create `app/lib/sources/{name}/client.ts` — API client or scraper
3. Create `app/lib/sources/{name}/provider.ts` — Implements `DataSourceProvider` interface
4. Create `app/server/functions/sync-{name}.ts` — Server function using `createServerFn`
5. Add a sync card in `app/routes/sync.tsx`

The `PlayerMatcher` handles resolving players to Sleeper IDs automatically. If the source provides a `sleeperId`, mapping is instant. Otherwise, it falls back to name + team + position matching.

## Player Matching

All player data is keyed by **Sleeper player ID** as the canonical identifier.

| Strategy | Confidence | Used When |
|----------|-----------|-----------|
| Direct `sleeperId` | Exact | Source provides Sleeper ID (e.g., FantasyCalc) |
| Name + Team + Position | High | Composite key matches Sleeper DB |
| Fuzzy (stripped suffixes) | Low | Handles Jr., III, hyphens, apostrophes |
| Unresolved | — | Stored separately for manual review |

## Tech Stack

- **[TanStack Start](https://tanstack.com/start)** — Full-stack React framework
- **[TanStack Router](https://tanstack.com/router)** — Type-safe file-based routing
- **[TanStack Table](https://tanstack.com/table)** — Headless table with sorting/filtering
- **[TanStack DB](https://tanstack.com/db)** — Reactive client-side database (localStorage)
- **[Tailwind CSS v4](https://tailwindcss.com)** — Utility-first styling
- **[shadcn/ui](https://ui.shadcn.com)** — Component library (New York variant)
- **[Zod v4](https://zod.dev)** — Schema validation
- **[Playwright](https://playwright.dev)** — Browser automation (KTC scraping)
- **[Vite](https://vite.dev)** — Build tool
- **[pnpm](https://pnpm.io)** — Package manager

## Known Limitations

- KTC scraper selectors may need adjustment if KeepTradeCut changes their HTML structure
- The Sleeper player database is ~5MB; localStorage limits vary by browser (typically 5-10MB total)
- Currently defaults to 1QB, 12-team, full PPR redraft values for FantasyCalc
- No authentication or multi-user support (all data is local to the browser)

## License

ISC
