import type { AggregatedPlayer } from '@/lib/rankings/player-metrics'
import type { ConsensusThresholdMode } from '@/lib/rankings/consensus-threshold'
import { ActiveLaneNormTooltip } from '@/lib/rankings/norm-source-tooltip'
import { ConsensusIndicatorLine } from '@/components/league/consensus-flag'

export interface LeagueRosterSlotConsensusCtx {
  mode: ConsensusThresholdMode
  percentile: number
  agreementMinEach: number
  dynPercentileCutoff: number | null
  rdPercentileCutoff: number | null
}

export function LeagueRosterSlotTooltipBody({
  player,
  consensus,
}: {
  player: AggregatedPlayer
  consensus: LeagueRosterSlotConsensusCtx
}) {
  return (
    <div className="max-w-sm space-y-3 text-xs">
      <div className="space-y-2">
        <ActiveLaneNormTooltip player={player} lane="dynasty" />
        <ConsensusIndicatorLine
          laneLabel="Dynasty"
          deltaFc={player.dynDeltaNormFcVsKtc}
          deltaDd={player.dynDeltaNormDdVsKtc}
          minAbsDeltaPercentileCutoff={consensus.dynPercentileCutoff}
          mode={consensus.mode}
          percentile={consensus.percentile}
          agreementMinEach={consensus.agreementMinEach}
        />
      </div>
      <div className="space-y-2 border-t border-border pt-2">
        <ActiveLaneNormTooltip player={player} lane="redraft" />
        <ConsensusIndicatorLine
          laneLabel="Redraft"
          deltaFc={player.rdDeltaNormFcVsKtc}
          deltaDd={player.rdDeltaNormDdVsKtc}
          minAbsDeltaPercentileCutoff={consensus.rdPercentileCutoff}
          mode={consensus.mode}
          percentile={consensus.percentile}
          agreementMinEach={consensus.agreementMinEach}
        />
      </div>
    </div>
  )
}
