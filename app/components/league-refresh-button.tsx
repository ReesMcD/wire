'use client'

import * as React from 'react'
import { RefreshCw } from 'lucide-react'
import { useRouter } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  LEAGUE_FETCHED_AT_STORAGE_KEY,
  LEAGUE_ID_STORAGE_KEY,
  LEAGUE_STORAGE_EVENT,
} from '@/lib/league-storage'
import { getLeagueRosterSnapshot } from '@/server/functions/sync-sleeper'

export function LeagueRefreshButton({ className }: { className?: string }) {
  const router = useRouter()
  const [leagueId, setLeagueId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const read = () => {
      try {
        const id = localStorage.getItem(LEAGUE_ID_STORAGE_KEY)?.trim()
        setLeagueId(id || null)
      } catch {
        setLeagueId(null)
      }
    }
    read()
    window.addEventListener('storage', read)
    window.addEventListener(LEAGUE_STORAGE_EVENT, read)
    return () => {
      window.removeEventListener('storage', read)
      window.removeEventListener(LEAGUE_STORAGE_EVENT, read)
    }
  }, [])

  const onRefresh = async () => {
    if (!leagueId || busy) return
    setBusy(true)
    try {
      await getLeagueRosterSnapshot({ data: { leagueId } })
      try {
        localStorage.setItem(LEAGUE_FETCHED_AT_STORAGE_KEY, new Date().toISOString())
      } catch {
        /* ignore */
      }
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  if (!leagueId) return null

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn('gap-2', className)}
      disabled={busy}
      onClick={() => void onRefresh()}
      aria-label="Refresh league rosters from Sleeper"
      title="Refresh league rosters"
    >
      <RefreshCw className={cn('size-4 shrink-0', busy && 'animate-spin')} />
      <span className="hidden sm:inline text-muted-foreground">League</span>
    </Button>
  )
}
