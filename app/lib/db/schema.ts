import { z } from 'zod'

export const sleeperPlayerSchema = z.object({
  playerId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  team: z.string().nullable(),
  position: z.string().nullable(),
  age: z.number().nullable(),
  yearsExp: z.number().nullable(),
  searchFullName: z.string(),
  status: z.string().nullable(),
})

export type SleeperPlayer = z.infer<typeof sleeperPlayerSchema>

export const leagueSchema = z.object({
  leagueId: z.string(),
  name: z.string(),
  season: z.string(),
  totalRosters: z.number(),
  scoringSettings: z.record(z.string(), z.number()).optional(),
  rosterPositions: z.array(z.string()).optional(),
  status: z.string(),
})

export type League = z.infer<typeof leagueSchema>

export const leagueUserSchema = z.object({
  odataKey: z.string(),
  userId: z.string(),
  leagueId: z.string(),
  displayName: z.string(),
  teamName: z.string().nullable(),
  avatar: z.string().nullable(),
  isOwner: z.boolean(),
})

export type LeagueUser = z.infer<typeof leagueUserSchema>

export const rosterSchema = z.object({
  odataKey: z.string(),
  rosterId: z.number(),
  leagueId: z.string(),
  ownerId: z.string().nullable(),
  playerIds: z.array(z.string()),
  starters: z.array(z.string()),
  wins: z.number(),
  losses: z.number(),
  ties: z.number(),
})

export type Roster = z.infer<typeof rosterSchema>

export const playerValueSchema = z.object({
  id: z.string(),
  sleeperId: z.string(),
  sourceId: z.string(),
  value: z.number(),
  normalizedValue: z.number(),
  /** FC→KTC quantile-matched then max-scaled to 9999 per lane; KTC copies max-scale norm */
  normalizedValueQm: z.number().nullable(),
  overallRank: z.number().nullable(),
  positionRank: z.number().nullable(),
  trend: z.number().nullable(),
  /** Tier from gap detection on average normalized (FC + KTC + DD) / N when sources exist */
  tierAvg: z.number().nullable(),
  /** Tier from FantasyCalc normalized values only */
  tierFc: z.number().nullable(),
  /** Tier from KTC normalized values only */
  tierKtc: z.number().nullable(),
  /** Tier from Dynasty Daddy / ADP Daddy normalized values only */
  tierDd: z.number().nullable(),
  updatedAt: z.string(),
})

export type PlayerValue = z.infer<typeof playerValueSchema>

export const syncMetadataSchema = z.object({
  sourceId: z.string(),
  lastSyncedAt: z.string(),
  status: z.enum(['idle', 'syncing', 'error', 'success']),
  error: z.string().nullable(),
  recordCount: z.number(),
})

export type SyncMetadata = z.infer<typeof syncMetadataSchema>

export const unresolvedPlayerSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  rawName: z.string(),
  team: z.string().nullable(),
  position: z.string().nullable(),
  value: z.number(),
  fetchedAt: z.string(),
})

export type UnresolvedPlayer = z.infer<typeof unresolvedPlayerSchema>
