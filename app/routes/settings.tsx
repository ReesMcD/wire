import { createFileRoute, Link } from '@tanstack/react-router'
import { SettingsForm } from '@/components/settings/settings-form'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="container mx-auto flex min-h-0 max-w-3xl flex-1 flex-col overflow-hidden px-3 py-6 sm:px-4">
      <div className="mb-6 shrink-0 space-y-1">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Global defaults for normalization, league power badges, consensus icons, and rankings columns. Page-level
          choices (dynasty vs redraft, waiver highlights, etc.) stay on each screen.
        </p>
        <Link to="/rankings" search={{ leagueId: undefined }} className="text-sm underline">
          ← Rankings
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 sm:pr-4">
        <SettingsForm />
      </div>
    </div>
  )
}
