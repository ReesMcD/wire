'use client'

import * as React from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  LEAGUE_ID_STORAGE_KEY,
  LEAGUE_STORAGE_EVENT,
} from '@/lib/league-storage'

/** Top-nav link to waiver for the current league id in shared storage (same source as League refresh). */
export function LeagueWaiverNavLink() {
  const [leagueId, setLeagueId] = React.useState<string | null>(null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

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

  const waiverPath = leagueId ? `/league/${leagueId}/waiver` : null
  const isActive =
    waiverPath != null && (pathname === waiverPath || pathname === `${waiverPath}/`)

  if (!leagueId) {
    return (
      <Link
        to="/league"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        title="Load a league first"
      >
        Waiver
      </Link>
    )
  }

  return (
    <Link
      to="/league/$leagueId/waiver"
      params={{ leagueId }}
      className={
        isActive
          ? 'text-sm font-medium text-foreground'
          : 'text-sm text-muted-foreground transition-colors hover:text-foreground'
      }
    >
      Waiver
    </Link>
  )
}
