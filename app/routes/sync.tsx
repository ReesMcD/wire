import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { readSyncMetadata } from '@/server/functions/read-data'
import { getLeagueRosterSnapshot, syncSleeperPlayers } from '@/server/functions/sync-sleeper'
import {
  LEAGUE_FETCHED_AT_STORAGE_KEY,
  LEAGUE_ID_STORAGE_KEY,
  notifyLeagueStorageChanged,
} from '@/lib/league-storage'
import { syncFantasyCalc } from '@/server/functions/sync-fantasycalc'
import { syncKtc } from '@/server/functions/sync-ktc'
import { syncDynastyDaddy } from '@/server/functions/sync-dynasty-daddy'
import type { SyncMetadata } from '@/lib/db/schema'

import {
  SOURCE_FC_DYNASTY,
  SOURCE_FC_REDRAFT,
  SOURCE_KTC_DYNASTY,
  SOURCE_KTC_REDRAFT,
  SOURCE_DD_DYNASTY,
  SOURCE_DD_REDRAFT,
} from '@/lib/sync/tiering'

export const Route = createFileRoute('/sync')({
  loader: async () => {
    const metadata = await readSyncMetadata()
    return { metadata }
  },
  component: SyncPage,
})

interface SyncSettings {
  superflex: boolean
  ppr: 1 | 0.5
}

const DEFAULT_SETTINGS: SyncSettings = {
  superflex: true,
  ppr: 1,
}

function SyncPage() {
  const router = useRouter()
  const loaderData = Route.useLoaderData()
  const [metadata, setMetadata] = useState<Record<string, SyncMetadata>>(loaderData.metadata)

  useEffect(() => {
    setMetadata(loaderData.metadata)
  }, [loaderData.metadata])

  useEffect(() => {
    try {
      const id = localStorage.getItem(LEAGUE_ID_STORAGE_KEY)?.trim()
      if (id) setLeagueIdInput(id)
    } catch {
      /* ignore */
    }
  }, [])
  const [settings, setSettings] = useState<SyncSettings>(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<{
    sleeper?: string
    fantasycalc?: string
    ktc?: string
    dynastyDaddy?: string
    league?: string
    all?: string
  }>({})
  const [leagueIdInput, setLeagueIdInput] = useState('')

  const refreshMeta = useCallback(async () => {
    const next = await readSyncMetadata()
    setMetadata(next)
  }, [])

  const run = async (
    key: 'sleeper' | 'fantasycalc' | 'ktc' | 'dynastyDaddy' | 'league',
    fn: () => Promise<unknown>,
  ) => {
    setBusy(key)
    setErrors((e) => ({ ...e, [key]: undefined }))
    try {
      await fn()
      await refreshMeta()
      await router.invalidate()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrors((e) => ({ ...e, [key]: msg }))
    } finally {
      setBusy(null)
    }
  }

  const onSyncSleeper = () => run('sleeper', () => syncSleeperPlayers())

  const onSyncFantasyCalc = () =>
    run('fantasycalc', () =>
      syncFantasyCalc({
        data: {
          numQbs: settings.superflex ? 2 : 1,
          numTeams: 12,
          ppr: settings.ppr,
        },
      }),
    )

  const onSyncKtc = () =>
    run('ktc', () =>
      syncKtc({
        data: {
          numQbs: settings.superflex ? 2 : 1,
        },
      }),
    )

  const onSyncDynastyDaddy = () => run('dynastyDaddy', () => syncDynastyDaddy())

  const onSyncAll = async () => {
    const id = leagueIdInput.trim()
    const collected: string[] = []
    setBusy('all')
    setErrors((e) => ({ ...e, all: undefined }))
    const step = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        collected.push(`${label}: ${msg}`)
      }
    }
    try {
      await step('Sleeper players', () => syncSleeperPlayers())
      await step('FantasyCalc', () =>
        syncFantasyCalc({
          data: {
            numQbs: settings.superflex ? 2 : 1,
            numTeams: 12,
            ppr: settings.ppr,
          },
        }),
      )
      await step('KTC', () =>
        syncKtc({
          data: {
            numQbs: settings.superflex ? 2 : 1,
          },
        }),
      )
      await step('Dynasty Daddy', () => syncDynastyDaddy())
      if (!id) {
        collected.push('League rosters: skipped (enter a league ID to fetch rosters).')
      } else {
        await step('League rosters', async () => {
          await getLeagueRosterSnapshot({ data: { leagueId: id } })
          try {
            localStorage.setItem(LEAGUE_ID_STORAGE_KEY, id)
            localStorage.setItem(LEAGUE_FETCHED_AT_STORAGE_KEY, new Date().toISOString())
            notifyLeagueStorageChanged()
          } catch {
            /* ignore */
          }
        })
      }
      await refreshMeta()
      await router.invalidate()
    } finally {
      setBusy(null)
      if (collected.length > 0) {
        setErrors((e) => ({ ...e, all: collected.join('\n') }))
      }
    }
  }

  const onSyncLeagueRosters = () =>
    run('league', async () => {
      const id = leagueIdInput.trim()
      if (!id) throw new Error('Enter your Sleeper league ID.')
      await getLeagueRosterSnapshot({ data: { leagueId: id } })
      try {
        localStorage.setItem(LEAGUE_ID_STORAGE_KEY, id)
        localStorage.setItem(LEAGUE_FETCHED_AT_STORAGE_KEY, new Date().toISOString())
        notifyLeagueStorageChanged()
      } catch {
        /* ignore */
      }
    })

  const updateSettings = (partial: Partial<SyncSettings>) => {
    setSettings((s) => ({ ...s, ...partial }))
  }

  const getSyncStatus = (id: string) => metadata[id]

  return (
    <div className="container mx-auto max-w-2xl min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Sync Data</h1>
        <p className="text-muted-foreground">
          Pull Sleeper players, then FantasyCalc, KTC, and Dynasty Daddy values (dynasty + ADP/redraft each
          where applicable).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sync all</CardTitle>
          <CardDescription>
            Runs Sleeper players → FantasyCalc → KTC → Dynasty Daddy → league rosters (if a league ID is set)
            in order. Partial failures are collected; successful steps stay saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {errors.all && (
            <pre className="max-h-40 overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive whitespace-pre-wrap">
              {errors.all}
            </pre>
          )}
          <Button onClick={onSyncAll} disabled={busy !== null}>
            {busy === 'all' ? 'Running full sync…' : 'Sync all'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scoring defaults</CardTitle>
          <CardDescription>
            Used for FantasyCalc and KTC sync. FantasyCalc and KTC pull dynasty and redraft in one run;
            Dynasty Daddy sync is separate (CSV download).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">QB format:</span>
            <div className="flex gap-1">
              <Button
                variant={settings.superflex ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateSettings({ superflex: true })}
              >
                Superflex
              </Button>
              <Button
                variant={!settings.superflex ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateSettings({ superflex: false })}
              >
                Single QB
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">PPR:</span>
            <div className="flex gap-1">
              <Button
                variant={settings.ppr === 1 ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateSettings({ ppr: 1 })}
              >
                Full PPR
              </Button>
              <Button
                variant={settings.ppr === 0.5 ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateSettings({ ppr: 0.5 })}
              >
                Half PPR
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sleeper — NFL players</CardTitle>
          <CardDescription>Required before resolving FantasyCalc / KTC / Dynasty Daddy names.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SyncStatusBadge meta={getSyncStatus('sleeper_players')} />
          {errors.sleeper && <p className="text-xs text-destructive">{errors.sleeper}</p>}
          <Button onClick={onSyncSleeper} disabled={busy !== null}>
            {busy === 'sleeper' ? 'Syncing…' : 'Sync players'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sleeper — league rosters</CardTitle>
          <CardDescription>
            Refetch users and rosters for Rankings (highlight / filter). Same League ID as in the Sleeper URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="League ID"
            value={leagueIdInput}
            onChange={(e) => setLeagueIdInput(e.target.value)}
            className="font-mono text-sm"
          />
          {errors.league && <p className="text-xs text-destructive">{errors.league}</p>}
          <Button onClick={onSyncLeagueRosters} disabled={busy !== null}>
            {busy === 'league' ? 'Fetching…' : 'Resync league rosters'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>FantasyCalc</CardTitle>
          <CardDescription>
            API: dynasty + redraft. {settings.superflex ? 'SF' : '1QB'} /{' '}
            {settings.ppr === 1 ? 'Full PPR' : 'Half PPR'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-start">
            <SyncStatusBadge label="Dyn" meta={getSyncStatus(SOURCE_FC_DYNASTY)} />
            <SyncStatusBadge label="Rd" meta={getSyncStatus(SOURCE_FC_REDRAFT)} />
          </div>
          {errors.fantasycalc && <p className="text-xs text-destructive">{errors.fantasycalc}</p>}
          <Button onClick={onSyncFantasyCalc} disabled={busy !== null}>
            {busy === 'fantasycalc' ? 'Syncing…' : 'Sync FantasyCalc'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keep Trade Cut</CardTitle>
          <CardDescription>
            Playwright scrape: dynasty + redraft. {settings.superflex ? 'SF' : '1QB'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-start">
            <SyncStatusBadge label="Dyn" meta={getSyncStatus(SOURCE_KTC_DYNASTY)} />
            <SyncStatusBadge label="Rd" meta={getSyncStatus(SOURCE_KTC_REDRAFT)} />
          </div>
          {errors.ktc && <p className="text-xs text-destructive">{errors.ktc}</p>}
          <Button onClick={onSyncKtc} disabled={busy !== null}>
            {busy === 'ktc' ? 'Syncing…' : 'Sync KTC'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dynasty Daddy</CardTitle>
          <CardDescription>
            Playwright: CSV export for Dynasty Daddy rankings and ADP Daddy (redraft lane).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-start">
            <SyncStatusBadge label="Dyn" meta={getSyncStatus(SOURCE_DD_DYNASTY)} />
            <SyncStatusBadge label="Rd" meta={getSyncStatus(SOURCE_DD_REDRAFT)} />
          </div>
          {errors.dynastyDaddy && <p className="text-xs text-destructive">{errors.dynastyDaddy}</p>}
          <Button onClick={onSyncDynastyDaddy} disabled={busy !== null}>
            {busy === 'dynastyDaddy' ? 'Syncing…' : 'Sync Dynasty Daddy'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function SyncStatusBadge({
  label,
  meta,
}: {
  label?: string
  meta: SyncMetadata | undefined
}) {
  if (!meta) return null

  const variant =
    meta.status === 'success' ? 'secondary' : meta.status === 'error' ? 'destructive' : 'outline'

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      {label && <span className="text-muted-foreground w-7 shrink-0">{label}</span>}
      <Badge variant={variant}>
        {meta.status === 'success'
          ? `${meta.recordCount} rows`
          : meta.status === 'error'
            ? 'Error'
            : meta.status}
      </Badge>
      {meta.lastSyncedAt && (
        <span className="text-muted-foreground">{new Date(meta.lastSyncedAt).toLocaleString()}</span>
      )}
      {meta.error && <span className="text-destructive">{meta.error}</span>}
    </div>
  )
}
