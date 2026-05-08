import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  DEFAULT_DEPTH_WEIGHTS,
  type DepthTier,
  type MetricLane,
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

export interface RankingsColumnVisibility {
  dynasty: boolean
  redraft: boolean
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
  rankingsHidePicks: boolean
  rankingsHideUnhighlighted: boolean
  rankingsColumnVisibility: RankingsColumnVisibility
  /** How strictly to show the FC+DD vs KTC agreement icon (rank spots vs adaptive norm tail). */
  consensusThresholdMode: ConsensusThresholdMode
  /** Rank mode: min(|FC rank − KTC|, |DD rank − KTC|) must be ≥ this (lower rank # = better). */
  consensusRankMinGap: number
  /** Percentile mode: cutoff = this percentile of min(|Δ FC|, |Δ DD|) over all non-pick players with both deltas. */
  consensusPercentile: number

  setMetricLane: (v: MetricLane) => void
  setNormMode: (v: NormMode) => void
  setPowerMode: (v: PowerMode) => void
  setTierIncludes: (updater: (prev: TierIncludes) => TierIncludes) => void
  setDepthWeights: (updater: (prev: Record<DepthTier, number>) => Record<DepthTier, number>) => void
  setScoreDisplay: (v: ScoreDisplay) => void
  setShowPortfolioShare: (v: boolean) => void
  setLeagueOverviewTab: (v: LeagueOverviewTab) => void
  setRankingsHidePicks: (v: boolean) => void
  setRankingsHideUnhighlighted: (v: boolean) => void
  setRankingsColumnVisibility: (
    updater: (prev: RankingsColumnVisibility) => RankingsColumnVisibility,
  ) => void
  setConsensusThresholdMode: (v: ConsensusThresholdMode) => void
  setConsensusRankMinGap: (v: number) => void
  setConsensusPercentile: (v: number) => void
  resetAll: () => void
}

const DEFAULTS = {
  metricLane: 'dynasty' as MetricLane,
  normMode: 'quantile' as NormMode,
  powerMode: 'additive' as PowerMode,
  tierIncludes: { starter: true, backup: true, bench: true } as TierIncludes,
  depthWeights: { ...DEFAULT_DEPTH_WEIGHTS },
  scoreDisplay: 'max9999' as ScoreDisplay,
  showPortfolioShare: false,
  leagueOverviewTab: 'teams' as LeagueOverviewTab,
  rankingsHidePicks: false,
  rankingsHideUnhighlighted: false,
  rankingsColumnVisibility: { dynasty: true, redraft: true } as RankingsColumnVisibility,
  consensusThresholdMode: 'rank' as ConsensusThresholdMode,
  consensusRankMinGap: 20,
  consensusPercentile: 90,
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
      const j = JSON.parse(colVisRaw) as Record<string, unknown>
      out.rankingsColumnVisibility = {
        dynasty: j.dynasty !== false,
        redraft: j.redraft !== false,
      }
    } catch {
      /* ignore */
    }
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
      setRankingsHidePicks: (v) => set({ rankingsHidePicks: v }),
      setRankingsHideUnhighlighted: (v) => set({ rankingsHideUnhighlighted: v }),
      setRankingsColumnVisibility: (updater) =>
        set((s) => ({ rankingsColumnVisibility: updater(s.rankingsColumnVisibility) })),
      setConsensusThresholdMode: (v) => set({ consensusThresholdMode: v }),
      setConsensusRankMinGap: (v) =>
        set({
          consensusRankMinGap: Number.isFinite(v) ? Math.max(1, Math.min(200, Math.round(v))) : 20,
        }),
      setConsensusPercentile: (v) =>
        set({
          consensusPercentile: Number.isFinite(v) ? Math.max(50, Math.min(99, Math.round(v))) : 90,
        }),
      resetAll: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'fantasy-ui-settings',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      migrate: (persisted, fromVersion) => {
        const s = (persisted ?? {}) as Partial<UiSettingsState>
        const v = typeof fromVersion === 'number' && Number.isFinite(fromVersion) ? fromVersion : 0
        if (v < 2) {
          return {
            ...s,
            consensusThresholdMode: s.consensusThresholdMode ?? 'rank',
            consensusRankMinGap:
              typeof s.consensusRankMinGap === 'number' && Number.isFinite(s.consensusRankMinGap)
                ? Math.max(1, Math.min(200, Math.round(s.consensusRankMinGap)))
                : 20,
            consensusPercentile:
              typeof s.consensusPercentile === 'number' && Number.isFinite(s.consensusPercentile)
                ? Math.max(50, Math.min(99, Math.round(s.consensusPercentile)))
                : 90,
          }
        }
        return persisted as UiSettingsState
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
        rankingsHidePicks: state.rankingsHidePicks,
        rankingsHideUnhighlighted: state.rankingsHideUnhighlighted,
        rankingsColumnVisibility: state.rankingsColumnVisibility,
        consensusThresholdMode: state.consensusThresholdMode,
        consensusRankMinGap: state.consensusRankMinGap,
        consensusPercentile: state.consensusPercentile,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<UiSettingsState>) ?? {}
        const hasPersisted = Object.keys(persisted).length > 0
        const legacy = hasPersisted ? {} : readLegacySettings()
        return { ...currentState, ...legacy, ...persisted }
      },
    },
  ),
)
