#!/usr/bin/env python3
"""Post-patch rankings: remove collapsed zustand props, Link player names, tweak title spacing."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / "app" / "routes" / "rankings.tsx"
text = p.read_text()

a = """  const rankingsDefaultLeagueId = useUiSettings((s) => s.rankingsDefaultLeagueId)
  const rankingsFiltersCollapsed = useUiSettings((s) => s.rankingsFiltersCollapsed)
  const setRankingsFiltersCollapsed = useUiSettings((s) => s.setRankingsFiltersCollapsed)
  const consensusPercentile = useUiSettings((s) => s.consensusPercentile)"""

b = """  const rankingsDefaultLeagueId = useUiSettings((s) => s.rankingsDefaultLeagueId)
  const consensusPercentile = useUiSettings((s) => s.consensusPercentile)"""

if a not in text:
    raise SystemExit("rankings filters block not found")
text = text.replace(a, b, 1)

old_cell = """        cell: ({ row }) => (
          <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
            <span className="font-medium">{row.original.name}</span>"""

new_cell = """        cell: ({ row }) => (
          <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
            <Link
              to="/player/$sleeperId"
              params={{ sleeperId: row.original.sleeperId }}
              search={{ leagueId: search.leagueId as string | undefined }}
              className="font-medium hover:underline"
            >
              {row.original.name}
            </Link>"""

if old_cell not in text:
    raise SystemExit("name cell not found")
text = text.replace(old_cell, new_cell, 1)

text = text.replace(
    "  }, [dynConsensusCutoff, rdConsensusCutoff])",
    "  }, [dynConsensusCutoff, rdConsensusCutoff, search.leagueId])",
    1,
)

old_tb = """          hideUnhighlighted={hideUnhighlighted}
          onHideUnhighlightedChange={setHideUnhighlighted}
          rankingsFiltersCollapsed={rankingsFiltersCollapsed}
          onRankingsFiltersCollapsedChange={setRankingsFiltersCollapsed}
        />"""

new_tb = """          hideUnhighlighted={hideUnhighlighted}
          onHideUnhighlightedChange={setHideUnhighlighted}
        />"""

if old_tb not in text:
    raise SystemExit("RankingsToolbar props block not found")
text = text.replace(old_tb, new_tb, 1)

text = text.replace(
    '      <div className="shrink-0 space-y-3">\n        <div>',
    '      <div className="shrink-0 space-y-2">\n        <div className="px-1">',
    1,
)

p.write_text(text)
print("ok", p, "lines", len(text.splitlines()))
