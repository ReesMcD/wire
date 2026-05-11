import { useEffect, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  LEAGUE_FETCHED_AT_STORAGE_KEY,
  LEAGUE_ID_STORAGE_KEY,
  notifyLeagueStorageChanged,
} from '@/lib/league-storage'
import { getLeagueRosterSnapshot } from '@/server/functions/sync-sleeper'
import {
  useUiSettings,
  type RankingsLaneSources,
  type ScoreDisplay,
} from '@/lib/stores/ui-settings'
import {
  DEFAULT_DEPTH_WEIGHTS,
  type DepthTier,
} from '@/lib/rankings/league-board-power-input'
import {
  explainNormMode,
  explainPortfolioShare,
  explainPowerMode,
  explainScoreDisplay,
  explainSettingsClearLeague,
  explainSettingsConsensusIntro,
  explainSettingsDepthWeightsRow,
  explainSettingsHidePickRows,
  explainSettingsLaneSourceToggles,
  explainSettingsLeaguePowerIntro,
  explainSettingsNormalizationIntro,
  explainSettingsRankingsColumnsIntro,
  explainSettingsRankingsLeagueIntro,
  explainSettingsRefreshRosters,
  explainSettingsSaveOpenRankings,
  explainSettingsSimilarityIncludePicks,
  poolLabel,
} from '@/lib/rankings/explain'
import { ConsensusIndicatorSettings } from '@/components/league/consensus-indicator-settings'

function clampWeight(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function LaneSourceToggles({
  title,
  lane,
  sources,
  onChange,
}: {
  title: string
  lane: 'dynasty' | 'redraft'
  sources: RankingsLaneSources
  onChange: (next: RankingsLaneSources) => void
}) {
  const toggle = (key: keyof RankingsLaneSources) =>
    onChange({ ...sources, [key]: !sources[key] })

  const labels: { key: keyof RankingsLaneSources; label: string }[] = [
    { key: 'ktc', label: 'KTC' },
    { key: 'fc', label: 'FC' },
    { key: 'dd', label: 'DD' },
    { key: 'avg', label: 'Avg' },
  ]

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="flex flex-wrap gap-2">
        {labels.map(({ key, label }) => (
          <Button
            key={`${lane}-${key}`}
            type="button"
            size="sm"
            variant={sources[key] ? 'default' : 'outline'}
            onClick={() => toggle(key)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function SettingsForm({ className }: { className?: string }) {
  const router = useRouter()
  const rankingsDefaultLeagueId = useUiSettings((s) => s.rankingsDefaultLeagueId)
  const setRankingsDefaultLeagueId = useUiSettings((s) => s.setRankingsDefaultLeagueId)
  const [leagueDraft, setLeagueDraft] = useState(rankingsDefaultLeagueId)
  const [leagueBusy, setLeagueBusy] = useState(false)

  useEffect(() => {
    setLeagueDraft(rankingsDefaultLeagueId)
  }, [rankingsDefaultLeagueId])

  const persistLeagueId = (id: string) => {
    const trimmed = id.trim()
    setRankingsDefaultLeagueId(trimmed)
    try {
      if (trimmed) {
        localStorage.setItem(LEAGUE_ID_STORAGE_KEY, trimmed)
      } else {
        localStorage.removeItem(LEAGUE_ID_STORAGE_KEY)
        localStorage.removeItem(LEAGUE_FETCHED_AT_STORAGE_KEY)
      }
      notifyLeagueStorageChanged()
    } catch {
      /* ignore */
    }
  }

  const normMode = useUiSettings((s) => s.normMode)
  const setNormMode = useUiSettings((s) => s.setNormMode)
  const powerMode = useUiSettings((s) => s.powerMode)
  const setPowerMode = useUiSettings((s) => s.setPowerMode)
  const tierIncludes = useUiSettings((s) => s.tierIncludes)
  const setTierIncludes = useUiSettings((s) => s.setTierIncludes)
  const depthWeights = useUiSettings((s) => s.depthWeights)
  const setDepthWeights = useUiSettings((s) => s.setDepthWeights)
  const scoreDisplay = useUiSettings((s) => s.scoreDisplay)
  const setScoreDisplay = useUiSettings((s) => s.setScoreDisplay)
  const showPortfolioShare = useUiSettings((s) => s.showPortfolioShare)
  const setShowPortfolioShare = useUiSettings((s) => s.setShowPortfolioShare)
  const powerIncludePicks = useUiSettings((s) => s.powerIncludePicks)
  const setPowerIncludePicks = useUiSettings((s) => s.setPowerIncludePicks)
  const hidePickRows = useUiSettings((s) => s.hidePickRows)
  const setHidePickRows = useUiSettings((s) => s.setHidePickRows)
  const similarityIncludePicks = useUiSettings((s) => s.similarityIncludePicks)
  const setSimilarityIncludePicks = useUiSettings((s) => s.setSimilarityIncludePicks)
  const srcVis = useUiSettings((s) => s.rankingsSourceVisibility)
  const setSrcVis = useUiSettings((s) => s.setRankingsSourceVisibility)
  const rankingsHideRawValueColumns = useUiSettings((s) => s.rankingsHideRawValueColumns)
  const setRankingsHideRawValueColumns = useUiSettings((s) => s.setRankingsHideRawValueColumns)
  const rankingsHideSourceTierColumns = useUiSettings((s) => s.rankingsHideSourceTierColumns)
  const setRankingsHideSourceTierColumns = useUiSettings((s) => s.setRankingsHideSourceTierColumns)
  const resetAll = useUiSettings((s) => s.resetAll)

  const pool = poolLabel(tierIncludes)

  const setWeight = (key: DepthTier, raw: string) => {
    const n = Number.parseFloat(raw)
    setDepthWeights((w) => ({ ...w, [key]: clampWeight(Number.isFinite(n) ? n : w[key]) }))
  }

  return (
    <div className={className}>
      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Rankings league (Sleeper)</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">{explainSettingsRankingsLeagueIntro()}</p>
          <p className="text-muted-foreground text-sm">
            Used for rankings highlights and roster refresh. After saving, open Rankings with this league loaded.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-[200px] flex-1 flex-col gap-1">
              <Label className="text-muted-foreground text-xs">League ID</Label>
              <Input
                className="font-mono text-sm"
                value={leagueDraft}
                onChange={(e) => setLeagueDraft(e.target.value)}
                placeholder="From league URL…"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  onClick={() => {
                    persistLeagueId(leagueDraft)
                    void router.navigate({ to: '/rankings', search: { leagueId: leagueDraft.trim() || undefined } })
                  }}
                >
                  Save & open rankings
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-snug">
                {explainSettingsSaveOpenRankings()}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setLeagueDraft('')
                    persistLeagueId('')
                    void router.navigate({ to: '/rankings', search: { leagueId: undefined } })
                  }}
                >
                  Clear
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-snug">{explainSettingsClearLeague()}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!rankingsDefaultLeagueId.trim() || leagueBusy}
                  onClick={() => {
                void (async () => {
                  const id = rankingsDefaultLeagueId.trim()
                  if (!id) return
                  setLeagueBusy(true)
                  try {
                    await getLeagueRosterSnapshot({ data: { leagueId: id } })
                    try {
                      localStorage.setItem(LEAGUE_FETCHED_AT_STORAGE_KEY, new Date().toISOString())
                    } catch {
                      /* ignore */
                    }
                    notifyLeagueStorageChanged()
                    await router.invalidate()
                  } finally {
                    setLeagueBusy(false)
                  }
                })()
              }}
            >
              <RefreshCw className={cn('mr-2 size-4', leagueBusy && 'animate-spin')} />
              Refresh rosters
            </Button>
            </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-snug">
                {explainSettingsRefreshRosters()}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-muted-foreground text-xs">
            Current:{' '}
            {rankingsDefaultLeagueId ? (
              <Link to="/rankings" search={{ leagueId: rankingsDefaultLeagueId }} className="text-foreground underline">
                Rankings with this league
              </Link>
            ) : (
              'none saved'
            )}
          </p>
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Normalization scale</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">{explainSettingsNormalizationIntro()}</p>
          <p className="text-muted-foreground text-sm">
            How raw source values are scaled before comparing across FantasyCalc, KTC, and Daddy Data.
          </p>
          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={normMode === 'max' ? 'default' : 'outline'}
                  onClick={() => setNormMode('max')}
                >
                  Max (9999)
                </Button>
              </TooltipTrigger>
              <TooltipContent>{explainNormMode('max')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={normMode === 'quantile' ? 'default' : 'outline'}
                  onClick={() => setNormMode('quantile')}
                >
                  Quantile-matched
                </Button>
              </TooltipTrigger>
              <TooltipContent>{explainNormMode('quantile')}</TooltipContent>
            </Tooltip>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Consensus indicator (FC + DD vs KTC)</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">{explainSettingsConsensusIntro()}</p>
          <ConsensusIndicatorSettings />
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">League power rankings</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">{explainSettingsLeaguePowerIntro()}</p>
          <p className="text-muted-foreground text-sm">
            Pool tier toggles stay on the league overview page; these control how power numbers are computed and
            displayed on badges.
          </p>
          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={powerMode === 'additive' ? 'default' : 'outline'}
                  onClick={() => setPowerMode('additive')}
                >
                  Additive power
                </Button>
              </TooltipTrigger>
              <TooltipContent>{explainPowerMode('additive', tierIncludes, depthWeights)}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={powerMode === 'depthWeighted' ? 'default' : 'outline'}
                  onClick={() => setPowerMode('depthWeighted')}
                >
                  Depth-weighted
                </Button>
              </TooltipTrigger>
              <TooltipContent>{explainPowerMode('depthWeighted', tierIncludes, depthWeights)}</TooltipContent>
            </Tooltip>
          </div>

          {powerMode === 'depthWeighted' && (
            <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/20 p-3">
              <p className="text-muted-foreground w-full text-xs leading-relaxed">{explainSettingsDepthWeightsRow()}</p>
              <span className="text-muted-foreground text-xs font-medium">Depth weights</span>
              {(['starter', 'backup', 'bench'] as const).map((tier) => (
                <label key={tier} className="flex flex-col gap-0.5 text-xs">
                  <span className="text-muted-foreground capitalize">{tier}</span>
                  <Input
                    className="h-8 w-20 font-mono text-xs"
                    value={String(depthWeights[tier])}
                    onChange={(e) => setWeight(tier, e.target.value)}
                  />
                </label>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDepthWeights(() => ({ ...DEFAULT_DEPTH_WEIGHTS }))}
              >
                Reset weights
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <span className="text-muted-foreground w-full text-sm">Badge scale:</span>
            {(['max9999', 'ordinal', 'percentile'] as const).map((sd) => {
              const label = sd === 'max9999' ? 'Max 9999' : sd === 'ordinal' ? 'Ordinal rank' : 'Percentile'
              return (
                <Tooltip key={sd}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant={scoreDisplay === sd ? 'default' : 'outline'}
                      onClick={() => setScoreDisplay(sd as ScoreDisplay)}
                    >
                      {label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{explainScoreDisplay(sd as ScoreDisplay)}</TooltipContent>
                </Tooltip>
              )
            })}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={showPortfolioShare ? 'default' : 'outline'}
                  onClick={() => setShowPortfolioShare(!showPortfolioShare)}
                >
                  League total %
                </Button>
              </TooltipTrigger>
              <TooltipContent>{explainPortfolioShare(showPortfolioShare)}</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={powerIncludePicks ? 'default' : 'outline'}
                  onClick={() => setPowerIncludePicks(!powerIncludePicks)}
                >
                  Include picks in power
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                When on, draft capital counts toward team raw power sums (picks are bench-tier). Turn off to match
                legacy player-only totals.
              </TooltipContent>
            </Tooltip>
          </div>

          <p className="text-muted-foreground text-xs">
            Current tier pool label: {pool}. Toggle starters / backups / bench on the league overview page.
          </p>
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Rankings table columns</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">{explainSettingsRankingsColumnsIntro()}</p>
          <p className="text-muted-foreground text-sm">
            Choose which source blocks appear in the wide spreadsheet on the Rankings page.
          </p>
          <LaneSourceToggles
            title="Dynasty sources"
            lane="dynasty"
            sources={srcVis.dynasty}
            onChange={(dynasty) => setSrcVis((prev) => ({ ...prev, dynasty }))}
          />
          <LaneSourceToggles
            title="Redraft sources"
            lane="redraft"
            sources={srcVis.redraft}
            onChange={(redraft) => setSrcVis((prev) => ({ ...prev, redraft }))}
          />
          <p className="text-muted-foreground text-xs leading-relaxed">{explainSettingsLaneSourceToggles()}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-muted-foreground text-sm">Hide raw value columns (KTC/FC/DD raw)</Label>
            <Button
              type="button"
              size="sm"
              variant={rankingsHideRawValueColumns ? 'default' : 'outline'}
              onClick={() => setRankingsHideRawValueColumns(!rankingsHideRawValueColumns)}
            >
              {rankingsHideRawValueColumns ? 'On' : 'Off'}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Applies to the Rankings spreadsheet and team roster table. Norms, ranks, and deltas stay visible.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-muted-foreground text-sm">Hide per-source tier badges (T KTC, T DD, …)</Label>
            <Button
              type="button"
              size="sm"
              variant={rankingsHideSourceTierColumns ? 'default' : 'outline'}
              onClick={() => setRankingsHideSourceTierColumns(!rankingsHideSourceTierColumns)}
            >
              {rankingsHideSourceTierColumns ? 'On' : 'Off'}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Hides source tier columns only. Avg “Tier Σ” under each lane’s average block stays visible.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-muted-foreground text-sm">Hide pick rows (rankings / roster lists)</Label>
            <Button
              type="button"
              size="sm"
              variant={hidePickRows ? 'default' : 'outline'}
              onClick={() => setHidePickRows(!hidePickRows)}
            >
              {hidePickRows ? 'On' : 'Off'}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">{explainSettingsHidePickRows()}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-muted-foreground text-sm">Similarity lists include picks</Label>
            <Button
              type="button"
              size="sm"
              variant={similarityIncludePicks ? 'default' : 'outline'}
              onClick={() => setSimilarityIncludePicks(!similarityIncludePicks)}
            >
              {similarityIncludePicks ? 'On' : 'Off'}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">{explainSettingsSimilarityIncludePicks()}</p>
        </section>

        <Separator />

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Reset restores every saved preference on this page (league ID, norms, consensus, power, column visibility,
            toggles) to the app defaults. It does not delete synced database data.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" size="sm" onClick={() => resetAll()}>
              Reset all settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
