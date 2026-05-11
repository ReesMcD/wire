import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AggregatedPlayer } from '@/lib/rankings/player-metrics'
import { formatPosRankLabel } from '@/lib/rankings/neighbor-lists'
import { wrapNormWithLaneTooltip, type TableMetricLane } from '@/lib/rankings/norm-source-tooltip'

/** Grouped KTC/FC/DD/Avg dynasty + redraft blocks for rankings + team roster wide tables. */
export function wideSpreadsheetDataColumnGroups(opts: {
  metricLane: TableMetricLane
}): ColumnDef<AggregatedPlayer>[] {
  const { metricLane } = opts

  const tierCell = (val: number | null) =>
    val !== null ? <Badge variant="secondary">T{val}</Badge> : '-'

  const normCell = (val: number | null, player: AggregatedPlayer, columnLane: TableMetricLane) =>
    wrapNormWithLaneTooltip(
      metricLane,
      columnLane,
      player,
      <span className="tabular-nums">{val !== null ? val.toLocaleString() : '-'}</span>,
    )

  const rawCell = (val: number | null) => (
    <span className="text-muted-foreground">{val !== null ? val.toLocaleString() : '-'}</span>
  )

  const deltaPtsCell = (val: number | null) => {
    if (val === null) return '-'
    const text = val > 0 ? `+${val.toLocaleString()}` : val.toLocaleString()
    return (
      <span
        className={cn(
          val > 0 && 'text-emerald-600 dark:text-emerald-500',
          val < 0 && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {text}
      </span>
    )
  }

  const rankOverall = (rank: number | null) => <span>{rank !== null ? `#${rank}` : '—'}</span>

  const posRankOnly = (p: AggregatedPlayer, posRank: number | null, rank: number | null) =>
    posRank != null && rank != null ? (
      <span className="text-muted-foreground text-xs">{formatPosRankLabel(p.position, posRank)}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    )

  return [
    {
      id: 'dynasty_avg',
      header: 'Avg Dynasty',
      columns: [
        {
          id: 'dynasty_avg_norm',
          accessorKey: 'dynAvgNorm',
          header: 'Avg',
          cell: ({ row, getValue }) => {
            const val = getValue() as number | null
            const p = row.original
            const inner =
              val === null ? (
                <span>-</span>
              ) : (
                <span className="font-semibold tabular-nums">{val.toLocaleString()}</span>
              )
            return wrapNormWithLaneTooltip(metricLane, 'dynasty', p, inner)
          },
        },
        {
          id: 'dynasty_avg_pos',
          accessorKey: 'dynAvgPosRank',
          header: 'Avg pos',
          cell: ({ row, getValue }) => {
            const pr = getValue() as number | null
            const p = row.original
            return pr != null ? (
              <span className="text-muted-foreground text-xs">{formatPosRankLabel(p.position, pr)}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          },
        },
        {
          id: 'dynasty_avg_tier',
          accessorKey: 'dynTierAvg',
          header: 'Tier Σ',
          cell: ({ getValue }) => tierCell(getValue() as number | null),
        },
      ],
    },
    {
      id: 'dynasty_ktc',
      header: 'KTC Dynasty',
      columns: [
        {
          id: 'dynasty_ktc_rank',
          accessorKey: 'dynKtcRank',
          header: 'KTC #',
          cell: ({ getValue }) => rankOverall(getValue() as number | null),
        },
        {
          id: 'dynasty_ktc_pos',
          accessorKey: 'dynKtcPosRank',
          header: 'KTC pos',
          cell: ({ row, getValue }) =>
            posRankOnly(row.original, getValue() as number | null, row.original.dynKtcRank),
        },
        {
          id: 'dynasty_ktc_raw',
          accessorKey: 'dynKtcValue',
          header: 'KTC raw',
          cell: ({ getValue }) => rawCell(getValue() as number | null),
        },
        {
          id: 'dynasty_ktc_norm',
          accessorKey: 'dynKtcNorm',
          header: 'KTC norm',
          cell: ({ row, getValue }) => normCell(getValue() as number | null, row.original, 'dynasty'),
        },
        {
          id: 'dynasty_ktc_tier',
          accessorKey: 'dynTierKtc',
          header: 'T KTC',
          cell: ({ getValue }) => tierCell(getValue() as number | null),
        },
      ],
    },
    {
      id: 'dynasty_dd',
      header: 'Dynasty Daddy',
      columns: [
        {
          id: 'dynasty_dd_rank',
          accessorKey: 'dynDdRank',
          header: 'DD #',
          cell: ({ getValue }) => rankOverall(getValue() as number | null),
        },
        {
          id: 'dynasty_dd_pos',
          accessorKey: 'dynDdPosRank',
          header: 'DD pos',
          cell: ({ row, getValue }) =>
            posRankOnly(row.original, getValue() as number | null, row.original.dynDdRank),
        },
        {
          id: 'dynasty_dd_raw',
          accessorKey: 'dynDdValue',
          header: 'DD raw',
          cell: ({ getValue }) => rawCell(getValue() as number | null),
        },
        {
          id: 'dynasty_dd_norm',
          accessorKey: 'dynDdNorm',
          header: 'DD norm',
          cell: ({ row, getValue }) => normCell(getValue() as number | null, row.original, 'dynasty'),
        },
        {
          id: 'dynasty_dd_tier',
          accessorKey: 'dynTierDd',
          header: 'T DD',
          cell: ({ getValue }) => tierCell(getValue() as number | null),
        },
        {
          id: 'dynasty_dd_delta',
          accessorKey: 'dynDeltaNormDdVsKtc',
          header: 'Δ pts DD',
          cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
        },
      ],
    },
    {
      id: 'dynasty_fc',
      header: 'FantasyCalc Dynasty',
      columns: [
        {
          id: 'dynasty_fc_rank',
          accessorKey: 'dynFcRank',
          header: 'FC #',
          cell: ({ getValue }) => rankOverall(getValue() as number | null),
        },
        {
          id: 'dynasty_fc_pos',
          accessorKey: 'dynFcPosRank',
          header: 'FC pos',
          cell: ({ row, getValue }) =>
            posRankOnly(row.original, getValue() as number | null, row.original.dynFcRank),
        },
        {
          id: 'dynasty_fc_raw',
          accessorKey: 'dynFcValue',
          header: 'FC raw',
          cell: ({ getValue }) => rawCell(getValue() as number | null),
        },
        {
          id: 'dynasty_fc_norm',
          accessorKey: 'dynFcNorm',
          header: 'FC norm',
          cell: ({ row, getValue }) => normCell(getValue() as number | null, row.original, 'dynasty'),
        },
        {
          id: 'dynasty_fc_tier',
          accessorKey: 'dynTierFc',
          header: 'T FC',
          cell: ({ getValue }) => tierCell(getValue() as number | null),
        },
        {
          id: 'dynasty_fc_delta',
          accessorKey: 'dynDeltaNormFcVsKtc',
          header: 'Δ pts',
          cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
        },
      ],
    },
    {
      id: 'redraft_avg',
      header: 'Avg Redraft',
      columns: [
        {
          id: 'redraft_avg_norm',
          accessorKey: 'rdAvgNorm',
          header: 'Avg',
          cell: ({ row, getValue }) => {
            const val = getValue() as number | null
            const p = row.original
            const inner =
              val === null ? (
                <span>-</span>
              ) : (
                <span className="font-semibold tabular-nums">{val.toLocaleString()}</span>
              )
            return wrapNormWithLaneTooltip(metricLane, 'redraft', p, inner)
          },
        },
        {
          id: 'redraft_avg_pos',
          accessorKey: 'rdAvgPosRank',
          header: 'Avg pos',
          cell: ({ row, getValue }) => {
            const pr = getValue() as number | null
            const p = row.original
            return pr != null ? (
              <span className="text-muted-foreground text-xs">{formatPosRankLabel(p.position, pr)}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          },
        },
        {
          id: 'redraft_avg_tier',
          accessorKey: 'rdTierAvg',
          header: 'Tier Σ',
          cell: ({ getValue }) => tierCell(getValue() as number | null),
        },
      ],
    },
    {
      id: 'redraft_ktc',
      header: 'KTC Redraft',
      columns: [
        {
          id: 'redraft_ktc_rank',
          accessorKey: 'rdKtcRank',
          header: 'KTC #',
          cell: ({ getValue }) => rankOverall(getValue() as number | null),
        },
        {
          id: 'redraft_ktc_pos',
          accessorKey: 'rdKtcPosRank',
          header: 'KTC pos',
          cell: ({ row, getValue }) =>
            posRankOnly(row.original, getValue() as number | null, row.original.rdKtcRank),
        },
        {
          id: 'redraft_ktc_raw',
          accessorKey: 'rdKtcValue',
          header: 'KTC raw',
          cell: ({ getValue }) => rawCell(getValue() as number | null),
        },
        {
          id: 'redraft_ktc_norm',
          accessorKey: 'rdKtcNorm',
          header: 'KTC norm',
          cell: ({ row, getValue }) => normCell(getValue() as number | null, row.original, 'redraft'),
        },
        {
          id: 'redraft_ktc_tier',
          accessorKey: 'rdTierKtc',
          header: 'T KTC',
          cell: ({ getValue }) => tierCell(getValue() as number | null),
        },
      ],
    },
    {
      id: 'redraft_dd',
      header: 'ADP Daddy',
      columns: [
        {
          id: 'redraft_dd_rank',
          accessorKey: 'rdDdRank',
          header: 'ADP #',
          cell: ({ getValue }) => rankOverall(getValue() as number | null),
        },
        {
          id: 'redraft_dd_pos',
          accessorKey: 'rdDdPosRank',
          header: 'ADP pos',
          cell: ({ row, getValue }) =>
            posRankOnly(row.original, getValue() as number | null, row.original.rdDdRank),
        },
        {
          id: 'redraft_dd_raw',
          accessorKey: 'rdDdValue',
          header: 'ADP raw',
          cell: ({ getValue }) => rawCell(getValue() as number | null),
        },
        {
          id: 'redraft_dd_norm',
          accessorKey: 'rdDdNorm',
          header: 'ADP norm',
          cell: ({ row, getValue }) => normCell(getValue() as number | null, row.original, 'redraft'),
        },
        {
          id: 'redraft_dd_tier',
          accessorKey: 'rdTierDd',
          header: 'T ADP',
          cell: ({ getValue }) => tierCell(getValue() as number | null),
        },
        {
          id: 'redraft_dd_delta',
          accessorKey: 'rdDeltaNormDdVsKtc',
          header: 'Δ pts ADP',
          cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
        },
      ],
    },
    {
      id: 'redraft_fc',
      header: 'FantasyCalc Redraft',
      columns: [
        {
          id: 'redraft_fc_rank',
          accessorKey: 'rdFcRank',
          header: 'FC #',
          cell: ({ getValue }) => rankOverall(getValue() as number | null),
        },
        {
          id: 'redraft_fc_pos',
          accessorKey: 'rdFcPosRank',
          header: 'FC pos',
          cell: ({ row, getValue }) =>
            posRankOnly(row.original, getValue() as number | null, row.original.rdFcRank),
        },
        {
          id: 'redraft_fc_raw',
          accessorKey: 'rdFcValue',
          header: 'FC raw',
          cell: ({ getValue }) => rawCell(getValue() as number | null),
        },
        {
          id: 'redraft_fc_norm',
          accessorKey: 'rdFcNorm',
          header: 'FC norm',
          cell: ({ row, getValue }) => normCell(getValue() as number | null, row.original, 'redraft'),
        },
        {
          id: 'redraft_fc_tier',
          accessorKey: 'rdTierFc',
          header: 'T FC',
          cell: ({ getValue }) => tierCell(getValue() as number | null),
        },
        {
          id: 'redraft_fc_delta',
          accessorKey: 'rdDeltaNormFcVsKtc',
          header: 'Δ pts',
          cell: ({ getValue }) => deltaPtsCell(getValue() as number | null),
        },
      ],
    },
  ]
}
