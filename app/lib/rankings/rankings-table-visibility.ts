import type { VisibilityState } from '@tanstack/react-table'
import type { RankingsSourceVisibility } from '@/lib/stores/ui-settings'

/** TanStack column ids for source groups (matches rankings.tsx — no parent dynasty/redraft column). */
export function tableVisibilityFromRankingsSources(src: RankingsSourceVisibility): VisibilityState {
  return {
    dynasty_ktc: src.dynasty.ktc,
    dynasty_dd: src.dynasty.dd,
    dynasty_fc: src.dynasty.fc,
    dynasty_avg: src.dynasty.avg,
    redraft_ktc: src.redraft.ktc,
    redraft_dd: src.redraft.dd,
    redraft_fc: src.redraft.fc,
    redraft_avg: src.redraft.avg,
  }
}
