import { Link, useRouter } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useLeagueRoute } from '@/lib/league-route-context'
import { useUiSettings } from '@/lib/stores/ui-settings'
import { getLeagueRosterSnapshot } from '@/server/functions/sync-sleeper'
import type { LeagueUser, Roster } from '@/lib/db/schema'
import { LEAGUE_FETCHED_AT_STORAGE_KEY, LEAGUE_ID_STORAGE_KEY, notifyLeagueStorageChanged } from '@/lib/league-storage'

function rosterDisplayName(roster: Roster, users: LeagueUser[]) {
  const u = users.find((x) => x.userId === roster.ownerId)
  return u?.teamName ?? u?.displayName ?? `Roster ${roster.rosterId}`
}

export function LeagueChrome({ className }: { className?: string }) {
  const { leagueId, leagueSnapshot } = useLeagueRoute()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const myMap = useUiSettings((s) => s.myRosterIdByLeagueId)
  const setMyRoster = useUiSettings((s) => s.setMyRosterIdForLeague)
  const myRosterId = myMap[leagueId] ?? null

  useEffect(() => {
    try {
      localStorage.setItem(LEAGUE_ID_STORAGE_KEY, leagueId)
      localStorage.setItem(LEAGUE_FETCHED_AT_STORAGE_KEY, leagueSnapshot.fetchedAt)
      notifyLeagueStorageChanged()
    } catch {
      /* ignore */
    }
  }, [leagueId, leagueSnapshot.fetchedAt])

  const onRefresh = async () => {
    if (busy) return
    setBusy(true)
    try {
      await getLeagueRosterSnapshot({ data: { leagueId } })
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  const selectValue = myRosterId != null ? String(myRosterId) : '__none__'

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className,
      )}
    >
      <div className="mx-auto flex max-w-[100vw] flex-col gap-2 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight">{leagueSnapshot.league.name}</p>
          <p className="text-muted-foreground truncate text-xs">{leagueSnapshot.league.season}</p>
        </div>
        <nav className="flex flex-wrap items-center gap-1.5 text-sm">
          <Link
            to="/league/$leagueId"
            params={{ leagueId }}
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-8 px-2' })}
          >
            Overview
          </Link>
          <Link
            to="/league/$leagueId/waiver"
            params={{ leagueId }}
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-8 px-2' })}
          >
            Waiver
          </Link>
          <Link
            to="/rankings"
            search={{ leagueId }}
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-8 px-2' })}
          >
            Rankings
          </Link>
        </nav>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <div className="flex min-w-[140px] flex-1 flex-col gap-0.5 sm:max-w-[220px] sm:flex-none">
            <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
              Your team
            </span>
            <Select
              value={selectValue}
              onValueChange={(v) => {
                if (v === '__none__') setMyRoster(leagueId, null)
                else setMyRoster(leagueId, Number.parseInt(v, 10))
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select roster…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {leagueSnapshot.rosters.map((r) => (
                  <SelectItem key={r.rosterId} value={String(r.rosterId)}>
                    {rosterDisplayName(r, leagueSnapshot.users)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={busy}
            onClick={() => void onRefresh()}
            title="Refresh league data"
          >
            <RefreshCw className={cn('size-4', busy && 'animate-spin')} />
          </Button>
        </div>
      </div>
    </header>
  )
}
