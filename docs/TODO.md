# TODO - Fantasy Aggregator

## Incomplete / Future Work

### High Priority

- [ ] **KTC scraper selectors**: The `.player-row`, `.player-name`, `.value` selectors need validation against live site - KTC may use different class names or dynamic rendering. Test with actual Playwright run and adjust.
- [ ] **Node.js upgrade**: Vite 7 warns about Node 20.18. Upgrade to Node 22+ for Vite 8 support and better ESM handling.
- [ ] **Sleeper player DB size**: The full player database is ~5MB which may approach localStorage limits. Consider IndexedDB (via custom TanStack DB storage adapter) if this becomes an issue.
- [ ] **Error boundaries**: Add React error boundaries around collection queries and sync operations.

### Medium Priority

- [ ] **Dynasty mode support**: FantasyCalc supports `isDynasty=true` - add a toggle in sync settings.
- [ ] **League format detection**: Auto-detect league settings (SF, TEP, PPR) from Sleeper league data and apply to value source queries.
- [ ] **Unresolved player UI**: Build a view to see unresolved players and manually map them.
- [ ] **Player detail page**: Click a player to see all source values, trends, and historical data.
- [ ] **Data freshness indicators**: Show how stale each source's data is on the rankings page.
- [ ] **Pagination**: Rankings table currently renders all rows - add virtual scrolling or pagination for performance.

### Low Priority / Nice to Have

- [ ] **Additional sources**: ESPN, Yahoo, FantasyPros ECR, Dynasty Process
- [ ] **Trade calculator**: Use aggregated values to evaluate trades
- [ ] **Power rankings**: Calculate team total value and rank teams
- [ ] **Export**: Export rankings to CSV
- [ ] **Dark/light mode toggle**: Currently hardcoded to dark mode
- [ ] **PWA support**: Add service worker for offline access since data is local
- [ ] **Multi-league support**: UI to switch between multiple synced leagues
- [ ] **Automated sync schedule**: Optional background sync with configurable intervals

### Technical Debt

- [ ] **Test coverage**: No tests yet - add unit tests for PlayerMatcher normalizers, integration tests for server functions
- [ ] **Zod validation on DB reads**: Collections accept any shape currently - add schema validation
- [ ] **Source registry**: The `registry.ts` is defined but not wired into the sync page (providers are imported directly). Refactor sync page to use registry for a fully pluggable system.
- [ ] **Type safety for useLiveQuery**: The query builder types can be finicky - add wrapper hooks per collection for better DX.
