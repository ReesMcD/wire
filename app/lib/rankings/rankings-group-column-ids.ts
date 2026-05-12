/** TanStack column group ids persisted for Rankings + team wide spreadsheet. */
export const RANKINGS_GROUP_COLUMN_IDS = [
  'dynasty_avg',
  'dynasty_ktc',
  'dynasty_dd',
  'dynasty_fc',
  'redraft_avg',
  'redraft_ktc',
  'redraft_dd',
  'redraft_fc',
  'dynasty_redraft_diff',
] as const

export type RankingsGroupColumnId = (typeof RANKINGS_GROUP_COLUMN_IDS)[number]
