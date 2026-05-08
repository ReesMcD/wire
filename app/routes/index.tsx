import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { readSyncMetadata, readValues } from '@/server/functions/read-data'

export const Route = createFileRoute('/')({
  loader: async () => {
    const [metadata, values] = await Promise.all([readSyncMetadata(), readValues()])
    return { metadata, valueCount: values.length }
  },
  component: HomePage,
})

function HomePage() {
  const { metadata, valueCount } = Route.useLoaderData()
  const hasData = valueCount > 0 || Object.keys(metadata).length > 0

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">
          Sync your Sleeper league and view aggregated player values.
        </p>
      </div>

      {!hasData ? (
        <Card>
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              No data synced yet. Head to the Sync page to pull player data and values,
              or run <code className="text-xs bg-muted px-1 py-0.5 rounded">pnpm sync</code> from the CLI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/sync">
              <Button>Go to Sync</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Link to="/rankings" search={{ leagueId: undefined }}>
            <Card className="hover:border-foreground/20 transition-colors cursor-pointer">
              <CardHeader>
                <CardTitle>Rankings</CardTitle>
                <CardDescription>
                  View aggregated player values from all sources.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link to="/league">
            <Card className="hover:border-foreground/20 transition-colors cursor-pointer">
              <CardHeader>
                <CardTitle>League</CardTitle>
                <CardDescription>
                  Overview, per-team breakdowns, and waiver wire for a Sleeper league.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link to="/sync">
            <Card className="hover:border-foreground/20 transition-colors cursor-pointer">
              <CardHeader>
                <CardTitle>Sync Data</CardTitle>
                <CardDescription>
                  Pull latest values from FantasyCalc, KTC, and Sleeper.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      )}
    </div>
  )
}
