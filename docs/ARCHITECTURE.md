# Architecture

## Overview

Fantasy Aggregator is a TanStack Start application that syncs Sleeper league data and aggregates player trade values from multiple sources (FantasyCalc, KeepTradeCut).

## Tech Stack

- **Framework**: TanStack Start (Vite, React)
- **Styling**: Tailwind CSS v4 + shadcn/ui (New York style)
- **Data**: TanStack DB (LocalStorage collections), TanStack Query, TanStack Table
- **Scraping**: Playwright (KTC only, server-side)
- **Validation**: Zod v4
- **Package Manager**: pnpm

## Directory Structure

```
app/
├── routes/              # File-based routing (TanStack Router)
│   ├── __root.tsx       # Root layout with nav
│   ├── index.tsx        # Dashboard
│   ├── sync.tsx         # Data sync controls
│   ├── rankings.tsx     # Aggregate rankings table
│   └── league.$leagueId.tsx  # League detail / team rosters
├── components/
│   └── ui/              # shadcn/ui components
├── lib/
│   ├── db/              # TanStack DB collections + Zod schemas
│   ├── sources/         # Data source providers
│   │   ├── types.ts     # DataSourceProvider interface
│   │   ├── registry.ts  # Source registration
│   │   ├── sleeper/     # Sleeper API client
│   │   ├── fantasycalc/ # FantasyCalc API client
│   │   └── ktc/         # KTC Playwright scraper
│   ├── players/         # Player identity resolution
│   │   ├── matcher.ts   # PlayerMatcher class
│   │   ├── normalizers.ts # Name normalization utilities
│   │   └── types.ts     # Match input/result types
│   └── utils.ts         # Tailwind cn() helper
├── server/
│   └── functions/       # TanStack Start server functions
└── styles/
    └── app.css          # Tailwind entry + CSS variables
```

## Key Patterns

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
4. Unresolved: stored separately for manual review

### TanStack DB Collections (LocalStorage-backed)

- `sleeperPlayersCollection` - Full player database (~5MB)
- `leaguesCollection` - Synced leagues
- `leagueUsersCollection` - League members
- `rostersCollection` - Team rosters
- `playerValuesCollection` - Values per source, keyed by `{sleeperId}:{sourceId}`
- `syncMetadataCollection` - Last sync timestamps/status
- `unresolvedPlayersCollection` - Failed matches

### Server Functions

Server functions handle external I/O:
- `syncSleeperPlayers` - GET all NFL players from Sleeper API
- `syncSleeperLeague` - GET league + rosters + users
- `syncFantasyCalc` - GET from api.fantasycalc.com
- `syncKtc` - Playwright scrape keeptradecut.com

## External APIs

### Sleeper (docs.sleeper.com)
- No auth required, read-only
- Rate limit: 1000 calls/min
- `GET /v1/players/nfl` - All players (~5MB JSON)
- `GET /v1/league/{id}` - League info
- `GET /v1/league/{id}/rosters` - Rosters
- `GET /v1/league/{id}/users` - Users

### FantasyCalc (api.fantasycalc.com)
- No auth required
- `GET /values/current?isDynasty=false&numQbs=1&numTeams=12&ppr=1`
- Returns array with `player.sleeperId` for direct mapping
- Params: isDynasty, numQbs, numTeams, ppr

### KeepTradeCut (keeptradecut.com)
- No API available, requires Playwright scraping
- Scrapes `/fantasy-rankings` page
- Player matching via name/team composite key
