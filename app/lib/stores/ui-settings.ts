import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  DEFAULT_DEPTH_WEIGHTS,
  type DepthTier,
  type MetricLane,
  type NormLaneSource,
} from '@/lib/rankings/league-board-power-input'
import type { NormMode } from '@/lib/rankings/player-metrics'
import type { ConsensusThresholdMode } from '@/lib/rankings/consensus-threshold'

export type PowerMode = 'additive' | 'depthWeighted'
export type ScoreDisplay = 'max9999' | 'ordinal' | 'percentile'
export type LeagueOverviewTab = 'teams' | 'positions'

export interface TierIncludes {
  starter: boolean
  backup: boolean
  bench: boolean
}

/** Per-lane visibility for KTC / FC / DD / Avg column groups on rankings table. */
export interface RankingsLaneSources {
  ktc: boolean
  fc: boolean
  dd: boolean
  avg: boolean
}

export interface RankingsSourceVisibility {
  dynasty: RankingsLaneSources
  redraft: RankingsLaneSources
}

export function defaultRankingsLaneSources(): RankingsLaneSources {
  return { ktc: true, fc: true, dd: true, avg: true }
}

export function defaultRankingsSourceVisibility(): RankingsSourceVisibility {
  return {
    dynasty: defaultRankingsLaneSources(),
    redraft: defaultRankingsLaneSources(),
  }
}

interface UiSettingsState {
  metricLane: MetricLane
  normMode: NormMode
  powerMode: PowerMode
  tierIncludes: TierIncludes
  depthWeights: Record<DepthTier, number>
  scoreDisplay: ScoreDisplay
  showPortfolioShare: boolean
  leagueOverviewTab: LeagueOverviewTab
  /** Draft-pick rows hidden in rankings / roster lists (display). */
  hidePickRows: boolean
  rankingsHideUnhighlighted: boolean
  rankingsSourceVisibility: RankingsSourceVisibility
  /** Include draft pick values in league power / raw sums (when false, matches legacy). */
  powerIncludePicks: boolean
  /** Include draft picks as candidates in player-page similarity lists. */
  similarityIncludePicks: boolean
  /** Optional “my team” per Sleeper league id (roster id). */
  myRosterIdByLeagueId: Record<string, number>
  /** How strictly to show the FC+DD vs KTC agreement icon (percentile vs fixed per-source floor). */
  consensusThresholdMode: ConsensusThresholdMode
  /** Legacy rank-gap setting (unused); kept for persisted JSON compatibility. */
  consensusRankMinGap: number
  /** Percentile mode: cutoff = this percentile of min(|Δ FC|, |Δ DD|) over all non-pick players with both deltas. */
  consensusPercentile: number
  /** Agreement mode: require |Δ FC| ≥ this and |Δ DD| ≥ this (same sign vs KTC); 0 = any same-sign non-zero pair. */
  consensusMinNormDiff: number
  /** Collapsed filter toolbars (single row + “Filters” on mobile). */
  rankingsFiltersCollapsed: boolean
  leagueFiltersCollapsed: boolean
  teamFiltersCollapsed: boolean
  playerFiltersCollapsed: boolean
  /** Default Sleeper league id for rankings highlights (synced with shared league storage). */
  rankingsDefaultLeagueId: string
  /** Which norm source the league overview roster list uses for its per-slot number. */
  leagueOverviewDisplayNormSource: NormLaneSource
  /** Rankings / team table: hide KTC/FC/DD “raw” value columns (not avg). */
  rankingsHideRawValueColumns: boolean
  /** Rankings / team table: hide per-source tier badges (T KTC, etc.); avg “Tier Σ” stays visible. */
  rankingsHideSourceTierColumns: boolean

  setMetricLane: (v: MetricLane) => void
  setNormMode: (v: NormMode) => void
  setPowerMode: (v: PowerMode) => void
  setTierIncludes: (updater: (prev: TierIncludes) => TierIncludes) => void
  setDepthWeights: (updater: (prev: Record<DepthTier, number>) => Record<DepthTier, number>) => void
  setScoreDisplay: (v: ScoreDisplay) => void
  setShowPortfolioShare: (v: boolean) => void
  setLeagueOverviewTab: (v: LeagueOverviewTab) => void
  setHidePickRows: (v: boolean) => void
  setRankingsHideUnhighlighted: (v: boolean) => void
  setRankingsSourceVisibility: (
    updater: (prev: RankingsSourceVisibility) => RankingsSourceVisibility,
  ) => void
  setPowerIncludePicks: (v: boolean) => void
  setSimilarityIncludePicks: (v: boolean) => void
  setMyRosterIdForLeague: (leagueId: string, rosterId: number | null) => void
  setConsensusThresholdMode: (v: ConsensusThresholdMode) => void
  setConsensusRankMinGap: (v: number) => void
  setConsensusPercentile: (v: number) => void
  setConsensusMinNormDiff: (v: number) => void
  setRankingsFiltersCollapsed: (v: boolean) => void
  setLeagueFiltersCollapsed: (v: boolean) => void
  setTeamFiltersCollapsed: (v: boolean) => void
  setPlayerFiltersCollapsed: (v: boolean) => void
  setRankingsDefaultLeagueId: (v: string) => void
  setLeagueOverviewDisplayNormSource: (v: NormLaneSource) => void
  setRankingsHideRawValueColumns: (v: boolean) => void
  setRankingsHideSourceTierColumns: (v: boolean) => void
  resetAll: () => void
}

const DEFAULTS: Omit<
  UiSettingsState,
  | 'setMetricLane'
  | 'setNormMode'
  | 'setPowerMode'
  | 'setTierIncludes'
  | 'setDepthWeights'
  | 'setScoreDisplay'
  | 'setShowPortfolioShare'
  | 'setLeagueOverviewTab'
  | 'setHidePickRows'
  | 'setRankingsHideUnhighlighted'
  | 'setRankingsSourceVisibility'
  | 'setPowerIncludePicks'
  | 'setSimilarityIncludePicks'
  | 'setMyRosterIdForLeague'
  | 'setConsensusThresholdMode'
  | 'setConsensusRankMinGap'
  | 'setConsensusPercentile'
  | 'setConsensusMinNormDiff'
  | 'setRankingsFiltersCollapsed'
  | 'setLeagueFiltersCollapsed'
  | 'setTeamFiltersCollapsed'
  | 'setPlayerFiltersCollapsed'
  | 'setRankingsDefaultLeagueId'
  | 'setLeagueOverviewDisplayNormSource'
  | 'setRankingsHideRawValueColumns'
  | 'setRankingsHideSourceTierColumns'
  | 'resetAll'
> = {
  metricLane: 'dynasty',
  normMode: 'quantile',
  powerMode: 'additive',
  tierIncludes: { starter: true, backup: true, bench: true },
  depthWeights: { ...DEFAULT_DEPTH_WEIGHTS },
  scoreDisplay: 'max9999',
  showPortfolioShare: false,
  leagueOverviewTab: 'teams',
  hidePickRows: false,
  rankingsHideUnhighlighted: false,
  rankingsSourceVisibility: defaultRankingsSourceVisibility(),
  powerIncludePicks: true,
  similarityIncludePicks: true,
  myRosterIdByLeagueId: {},
  consensusThresholdMode: 'agreement',
  consensusRankMinGap: 20,
  consensusPercentile: 90,
  consensusMinNormDiff: 0,
  rankingsFiltersCollapsed: false,
  leagueFiltersCollapsed: false,
  teamFiltersCollapsed: false,
  playerFiltersCollapsed: false,
  rankingsDefaultLeagueId: '',
  leagueOverviewDisplayNormSource: 'avg',
  rankingsHideRawValueColumns: false,
  rankingsHideSourceTierColumns: false,
}

const LEGACY_KEYS = {
  normMode: 'rankings-norm-mode',
  tierIncludes: 'league-board-tier-includes',
  startersOnly: 'league-board-starters-only',
  powerMode: 'league-board-power-mode',
  depthWeights: 'league-board-depth-weights',
  scoreDisplay: 'league-board-score-display',
  portfolioShare: 'league-board-portfolio-share',
  columnVisibility: 'rankings-column-visibility',
}

type CoarseVis = { dynasty: boolean; redraft: boolean }

function migrateCoarseToSourceVisibility(c: CoarseVis | undefined): RankingsSourceVisibility {
  const d = c?.dynasty !== false
  const r = c?.redraft !== false
  const all = (on: boolean) => ({ ktc: on, fc: on, dd: on, avg: on })
  return { dynasty: all(d), redraft: all(r) }
}

/** One-time read of pre-store localStorage values. Returns a partial state slice and removes legacy keys it consumed. */
function readLegacySettings(): Partial<UiSettingsState> {
  if (typeof window === 'undefined') return {}
  const out: Partial<UiSettingsState> = {}
  const consume = (key: string) => {
    try {
      const v = localStorage.getItem(key)
      if (v !== null) localStorage.removeItem(key)
      return v
    } catch {
      return null
    }
  }

  const norm = consume(LEGACY_KEYS.normMode)
  if (norm === 'quantile' || norm === 'max') out.normMode = norm

  const tierRaw = consume(LEGACY_KEYS.tierIncludes)
  if (tierRaw) {
    try {
      const j = JSON.parse(tierRaw) as Record<string, unknown>
      out.tierIncludes = {
        starter: j.starter !== false,
        backup: j.backup !== false,
        bench: j.bench !== false,
      }
    } catch {
      /* ignore */
    }
  } else {
    const starters = consume(LEGACY_KEYS.startersOnly)
    if (starters === '1' || starters === 'true') {
      out.tierIncludes = { starter: true, backup: false, bench: false }
    }
  }

  const power = consume(LEGACY_KEYS.powerMode)
  if (power === 'depthWeighted' || power === 'additive') out.powerMode = power

  const weightsRaw = consume(LEGACY_KEYS.depthWeights)
  if (weightsRaw) {
    try {
      const j = JSON.parse(weightsRaw) as Record<string, number>
      const clamp = (n: unknown) => {
        const num = typeof n === 'number' ? n : Number.NaN
        return Number.isFinite(num) && num >= 0 ? num : 0
      }
      out.depthWeights = {
        starter: clamp(j.starter ?? DEFAULT_DEPTH_WEIGHTS.starter),
        backup: clamp(j.backup ?? DEFAULT_DEPTH_WEIGHTS.backup),
        bench: clamp(j.bench ?? DEFAULT_DEPTH_WEIGHTS.bench),
      }
    } catch {
      /* ignore */
    }
  }

  const score = consume(LEGACY_KEYS.scoreDisplay)
  if (score === 'max9999' || score === 'ordinal' || score === 'percentile') {
    out.scoreDisplay = score
  }

  const portfolio = consume(LEGACY_KEYS.portfolioShare)
  if (portfolio === '1') out.showPortfolioShare = true

  const colVisRaw = consume(LEGACY_KEYS.columnVisibility)
  if (colVisRaw) {
    try {
      const j = JSON.parse(colVisRaw) as CoarseVis
      out.rankingsSourceVisibility = migrateCoarseToSourceVisibility(j)
    } catch {
      /* ignore */
    }
  }

  return out
}

function migratePersistedToV3(raw: unknown): Partial<UiSettingsState> {
  const s = (raw ?? {}) as Record<string, unknown>
  const out: Partial<UiSettingsState> = {}

  if (typeof s.metricLane === 'string') out.metricLane = s.metricLane as MetricLane
  if (s.normMode === 'max' || s.normMode === 'quantile') out.normMode = s.normMode
  if (s.powerMode === 'additive' || s.powerMode === 'depthWeighted') out.powerMode = s.powerMode
  if (s.tierIncludes && typeof s.tierIncludes === 'object') out.tierIncludes = s.tierIncludes as TierIncludes
  if (s.depthWeights && typeof s.depthWeights === 'object') out.depthWeights = s.depthWeights as Record<DepthTier, number>
  if (s.scoreDisplay === 'max9999' || s.scoreDisplay === 'ordinal' || s.scoreDisplay === 'percentile') {
    out.scoreDisplay = s.scoreDisplay
  }
  if (typeof s.showPortfolioShare === 'boolean') out.showPortfolioShare = s.showPortfolioShare
  if (s.leagueOverviewTab === 'teams' || s.leagueOverviewTab === 'positions') {
    out.leagueOverviewTab = s.leagueOverviewTab
  }

  if (typeof s.hidePickRows === 'boolean') out.hidePickRows = s.hidePickRows
  else if (typeof s.rankingsHidePicks === 'boolean') out.hidePickRows = s.rankingsHidePicks

  if (typeof s.rankingsHideUnhighlighted === 'boolean') {
    out.rankingsHideUnhighlighted = s.rankingsHideUnhighlighted
  }

  if (s.rankingsSourceVisibility && typeof s.rankingsSourceVisibility === 'object') {
    const v = s.rankingsSourceVisibility as Record<string, unknown>
    if ('dynasty' in v && 'redraft' in v && typeof v.dynasty === 'object' && v.dynasty !== null) {
      out.rankingsSourceVisibility = s.rankingsSourceVisibility as RankingsSourceVisibility
    }
  } else if (s.rankingsColumnVisibility && typeof s.rankingsColumnVisibility === 'object') {
    out.rankingsSourceVisibility = migrateCoarseToSourceVisibility(
      s.rankingsColumnVisibility as CoarseVis,
    )
  }

  if (typeof s.powerIncludePicks === 'boolean') out.powerIncludePicks = s.powerIncludePicks
  if (typeof s.similarityIncludePicks === 'boolean') out.similarityIncludePicks = s.similarityIncludePicks
  if (s.myRosterIdByLeagueId && typeof s.myRosterIdByLeagueId === 'object') {
    out.myRosterIdByLeagueId = s.myRosterIdByLeagueId as Record<string, number>
  }

  let consensusMode = s.consensusThresholdMode
  if (consensusMode === 'all' || consensusMode === 'rank' || consensusMode === 'sign') {
    consensusMode = 'agreement'
  }
  if (consensusMode === 'percentile' || consensusMode === 'agreement') {
    out.consensusThresholdMode = consensusMode
  }
  if (typeof s.consensusRankMinGap === 'number' && Number.isFinite(s.consensusRankMinGap)) {
    out.consensusRankMinGap = Math.max(1, Math.min(200, Math.round(s.consensusRankMinGap)))
  }
  if (typeof s.consensusPercentile === 'number' && Number.isFinite(s.consensusPercentile)) {
    out.consensusPercentile = Math.max(50, Math.min(99, Math.round(s.consensusPercentile)))
  }
  if (typeof s.consensusMinNormDiff === 'number' && Number.isFinite(s.consensusMinNormDiff)) {
    out.consensusMinNormDiff = Math.max(0, Math.min(5000, Math.round(s.consensusMinNormDiff)))
  }

  if (typeof s.rankingsFiltersCollapsed === 'boolean') out.rankingsFiltersCollapsed = s.rankingsFiltersCollapsed
  if (typeof s.leagueFiltersCollapsed === 'boolean') out.leagueFiltersCollapsed = s.leagueFiltersCollapsed
  if (typeof s.teamFiltersCollapsed === 'boolean') out.teamFiltersCollapsed = s.teamFiltersCollapsed
  if (typeof s.playerFiltersCollapsed === 'boolean') out.playerFiltersCollapsed = s.playerFiltersCollapsed
  if (typeof s.rankingsDefaultLeagueId === 'string') out.rankingsDefaultLeagueId = s.rankingsDefaultLeagueId

  const disp = s.leagueOverviewDisplayNormSource
  if (disp === 'avg' || disp === 'ktc' || disp === 'fc' || disp === 'dd') {
    out.leagueOverviewDisplayNormSource = disp
  }

  if (typeof s.rankingsHideRawValueColumns === 'boolean') out.rankingsHideRawValueColumns = s.rankingsHideRawValueColumns
  if (typeof s.rankingsHideSourceTierColumns === 'boolean') {
    out.rankingsHideSourceTierColumns = s.rankingsHideSourceTierColumns
  }

  return out
}

export const useUiSettings = create<UiSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setMetricLane: (v) => set({ metricLane: v }),
      setNormMode: (v) => set({ normMode: v }),
      setPowerMode: (v) => set({ powerMode: v }),
      setTierIncludes: (updater) => set((s) => ({ tierIncludes: updater(s.tierIncludes) })),
      setDepthWeights: (updater) => set((s) => ({ depthWeights: updater(s.depthWeights) })),
      setScoreDisplay: (v) => set({ scoreDisplay: v }),
      setShowPortfolioShare: (v) => set({ showPortfolioShare: v }),
      setLeagueOverviewTab: (v) => set({ leagueOverviewTab: v }),
      setHidePickRows: (v) => set({ hidePickRows: v }),
      setRankingsHideUnhighlighted: (v) => set({ rankingsHideUnhighlighted: v }),
      setRankingsSourceVisibility: (updater) =>
        set((s) => ({ rankingsSourceVisibility: updater(s.rankingsSourceVisibility) })),
      setPowerIncludePicks: (v) => set({ powerIncludePicks: v }),
      setSimilarityIncludePicks: (v) => set({ similarityIncludePicks: v }),
      setMyRosterIdForLeague: (leagueId, rosterId) =>
        set((s) => {
          const next = { ...s.myRosterIdByLeagueId }
          if (rosterId == null) delete next[leagueId]
          else next[leagueId] = rosterId
          return { myRosterIdByLeagueId: next }
        }),
      setConsensusThresholdMode: (v) =>
        set({
          consensusThresholdMode: v === 'percentile' || v === 'agreement' ? v : 'agreement',
        }),
      setConsensusRankMinGap: (v) =>
        set({
          consensusRankMinGap: Number.isFinite(v) ? Math.max(1, Math.min(200, Math.round(v))) : 20,
        }),
      setConsensusPercentile: (v) =>
        set({
          consensusPercentile: Number.isFinite(v) ? Math.max(50, Math.min(99, Math.round(v))) : 90,
        }),
      setConsensusMinNormDiff: (v) =>
        set({
          consensusMinNormDiff: Number.isFinite(v) ? Math.max(0, Math.min(5000, Math.round(v))) : 0,
        }),
      setRankingsFiltersCollapsed: (v) => set({ rankingsFiltersCollapsed: v }),
      setLeagueFiltersCollapsed: (v) => set({ leagueFiltersCollapsed: v }),
      setTeamFiltersCollapsed: (v) => set({ teamFiltersCollapsed: v }),
      setPlayerFiltersCollapsed: (v) => set({ playerFiltersCollapsed: v }),
      setRankingsDefaultLeagueId: (v) => set({ rankingsDefaultLeagueId: v.trim() }),
      setLeagueOverviewDisplayNormSource: (v) => set({ leagueOverviewDisplayNormSource: v }),
      setRankingsHideRawValueColumns: (v) => set({ rankingsHideRawValueColumns: v }),
      setRankingsHideSourceTierColumns: (v) => set({ rankingsHideSourceTierColumns: v }),
      resetAll: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'fantasy-ui-settings',
      version: 8,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      migrate: (persisted, fromVersion) => {
        const v = typeof fromVersion === 'number' && Number.isFinite(fromVersion) ? fromVersion : 0
        const merged = { ...(persisted as object) } as Record<string, unknown>

        if (v < 2) {
          merged.consensusThresholdMode = merged.consensusThresholdMode ?? 'rank'
          merged.consensusRankMinGap =
            typeof merged.consensusRankMinGap === 'number' && Number.isFinite(merged.consensusRankMinGap)
              ? Math.max(1, Math.min(200, Math.round(merged.consensusRankMinGap)))
              : 20
          merged.consensusPercentile =
            typeof merged.consensusPercentile === 'number' && Number.isFinite(merged.consensusPercentile)
              ? Math.max(50, Math.min(99, Math.round(merged.consensusPercentile)))
              : 90
        }

        if (v < 3) {
          const coarse = merged.rankingsColumnVisibility as CoarseVis | undefined
          if (!merged.rankingsSourceVisibility) {
            merged.rankingsSourceVisibility = migrateCoarseToSourceVisibility(coarse)
          }
          merged.hidePickRows = merged.hidePickRows ?? merged.rankingsHidePicks ?? false
          merged.powerIncludePicks = merged.powerIncludePicks ?? true
          merged.similarityIncludePicks = merged.similarityIncludePicks ?? true
          merged.myRosterIdByLeagueId = (merged.myRosterIdByLeagueId as Record<string, number>) ?? {}
          merged.rankingsFiltersCollapsed = merged.rankingsFiltersCollapsed ?? false
          merged.leagueFiltersCollapsed = merged.leagueFiltersCollapsed ?? false
          merged.teamFiltersCollapsed = merged.teamFiltersCollapsed ?? false
          merged.playerFiltersCollapsed = merged.playerFiltersCollapsed ?? false
          delete merged.rankingsHidePicks
          delete merged.rankingsColumnVisibility
        }

        if (v < 4) {
          merged.rankingsDefaultLeagueId =
            typeof merged.rankingsDefaultLeagueId === 'string' ? merged.rankingsDefaultLeagueId : ''
        }

        if (v < 5) {
          if (merged.consensusThresholdMode === 'all') merged.consensusThresholdMode = 'sign'
          merged.consensusMinNormDiff =
            typeof merged.consensusMinNormDiff === 'number' && Number.isFinite(merged.consensusMinNormDiff)
              ? Math.max(0, Math.min(5000, Math.round(merged.consensusMinNormDiff as number)))
              : 0
        }

        if (v < 6) {
          const d = merged.leagueOverviewDisplayNormSource
          merged.leagueOverviewDisplayNormSource =
            d === 'avg' || d === 'ktc' || d === 'fc' || d === 'dd' ? d : 'avg'
        }

        if (v < 7) {
          const m = merged.consensusThresholdMode
          if (m === 'rank' || m === 'sign' || m === 'all') merged.consensusThresholdMode = 'agreement'
          else if (m !== 'percentile' && m !== 'agreement') merged.consensusThresholdMode = 'agreement'
        }

        if (v < 8) {
          merged.rankingsHideRawValueColumns = merged.rankingsHideRawValueColumns ?? false
          merged.rankingsHideSourceTierColumns = merged.rankingsHideSourceTierColumns ?? false
        }

        const partial = migratePersistedToV3(merged)
        return { ...DEFAULTS, ...partial } as UiSettingsState
      },
      partialize: (state) => ({
        metricLane: state.metricLane,
        normMode: state.normMode,
        powerMode: state.powerMode,
        tierIncludes: state.tierIncludes,
        depthWeights: state.depthWeights,
        scoreDisplay: state.scoreDisplay,
        showPortfolioShare: state.showPortfolioShare,
        leagueOverviewTab: state.leagueOverviewTab,
        hidePickRows: state.hidePickRows,
        rankingsHideUnhighlighted: state.rankingsHideUnhighlighted,
        rankingsSourceVisibility: state.rankingsSourceVisibility,
        powerIncludePicks: state.powerIncludePicks,
        similarityIncludePicks: state.similarityIncludePicks,
        myRosterIdByLeagueId: state.myRosterIdByLeagueId,
        consensusThresholdMode: state.consensusThresholdMode,
        consensusRankMinGap: state.consensusRankMinGap,
        consensusPercentile: state.consensusPercentile,
        consensusMinNormDiff: state.consensusMinNormDiff,
        rankingsFiltersCollapsed: state.rankingsFiltersCollapsed,
        leagueFiltersCollapsed: state.leagueFiltersCollapsed,
        teamFiltersCollapsed: state.teamFiltersCollapsed,
        playerFiltersCollapsed: state.playerFiltersCollapsed,
        rankingsDefaultLeagueId: state.rankingsDefaultLeagueId,
        leagueOverviewDisplayNormSource: state.leagueOverviewDisplayNormSource,
        rankingsHideRawValueColumns: state.rankingsHideRawValueColumns,
        rankingsHideSourceTierColumns: state.rankingsHideSourceTierColumns,
      }),
      merge: (persistedState, currentState) => {
        const persisted = migratePersistedToV3(persistedState)
        const hasPersisted = persisted && Object.keys(persisted).length > 0
        const legacy = hasPersisted ? {} : readLegacySettings()
        return { ...currentState, ...legacy, ...persisted }
      },
    },
  ),
)
