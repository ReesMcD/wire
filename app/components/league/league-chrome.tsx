import { Link, useRouter } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { PageSubheader } from '@/components/ui/page-subheader'
import { cn } from '@/lib/utils'
import { useLeagueRoute } from '@/lib/league-route-context'
import { getLeagueRosterSnapshot } from '@/server/functions/sync-sleeper'
import { LEAGUE_FETCHED_AT_STORAGE_KEY, LEAGUE_ID_STORAGE_KEY, notifyLeagueStorageChanged } from '@/lib/league-storage'

const navLinkClass = buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-8 px-2' })

export function LeagueChrome({ className }: { className?: string }) {
  const { leagueId, leagueSnapshot } = useLeagueRoute()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

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

  return (
    <PageSubheader
      className={cn(
        'sticky top-0 z-40 supports-[backdrop-filter]:bg-background/80',
        className,
      )}
    >
      <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <Link
          to="/league/$leagueId"
          params={{ leagueId }}
          activeOptions={{ exact: true }}
          className={navLinkClass}
          activeProps={{ className: cn(navLinkClass, 'bg-accent text-accent-foreground') }}
        >
          Overview
        </Link>
        <Link
          to="/league/$leagueId/waiver"
          params={{ leagueId }}
          className={navLinkClass}
          activeProps={{ className: cn(navLinkClass, 'bg-accent text-accent-foreground') }}
        >
          Waiver
        </Link>
        <Link
          to="/rankings"
          search={{ leagueId }}
          activeOptions={{ includeSearch: true }}
          className={navLinkClass}
          activeProps={{ className: cn(navLinkClass, 'bg-accent text-accent-foreground') }}
        >
          Rankings
        </Link>
      </nav>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="ml-auto h-8 w-8 shrink-0"
        disabled={busy}
        onClick={() => void onRefresh()}
        title="Refresh league data"
      >
        <RefreshCw className={cn('size-4', busy && 'animate-spin')} />
      </Button>
    </PageSubheader>
  )
}
