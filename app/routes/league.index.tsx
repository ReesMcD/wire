import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LEAGUE_FETCHED_AT_STORAGE_KEY,
  LEAGUE_ID_STORAGE_KEY,
  notifyLeagueStorageChanged,
} from '@/lib/league-storage'

export const Route = createFileRoute('/league/')({
  component: LeagueEntryPage,
})

function LeagueEntryPage() {
  const navigate = useNavigate()
  const [leagueInput, setLeagueInput] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const id = localStorage.getItem(LEAGUE_ID_STORAGE_KEY)?.trim()
      if (id) {
        navigate({ to: '/league/$leagueId', params: { leagueId: id }, replace: true })
      }
    } catch {
      /* ignore */
    }
  }, [navigate])

  const onLoadLeague = () => {
    const id = leagueInput.trim()
    if (!id) return
    try {
      localStorage.setItem(LEAGUE_ID_STORAGE_KEY, id)
      notifyLeagueStorageChanged()
    } catch {
      /* ignore */
    }
    navigate({ to: '/league/$leagueId', params: { leagueId: id } })
  }

  const onClearLeague = () => {
    try {
      localStorage.removeItem(LEAGUE_ID_STORAGE_KEY)
      localStorage.removeItem(LEAGUE_FETCHED_AT_STORAGE_KEY)
      notifyLeagueStorageChanged()
    } catch {
      /* ignore */
    }
    setLeagueInput('')
  }

  return (
    <div className="container mx-auto max-w-lg min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold">League</h1>
        <p className="text-muted-foreground mt-2">
          Load a Sleeper league to see the overview, per-team breakdowns, and waiver wire.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>League ID</CardTitle>
          <CardDescription>Paste your Sleeper league ID from the league URL.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-muted-foreground text-xs font-medium">Sleeper league ID</span>
            <Input
              placeholder="e.g. from league URL…"
              value={leagueInput}
              onChange={(e) => setLeagueInput(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <Button type="button" onClick={onLoadLeague}>
            Load league
          </Button>
          <Button type="button" variant="outline" onClick={onClearLeague}>
            Clear
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
