import * as React from 'react'
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'

import { LeagueRefreshButton } from '@/components/league-refresh-button'
import { ModeToggle } from '@/components/mode-toggle'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useUiSettings } from '@/lib/stores/ui-settings'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Fantasy Aggregator' },
    ],
    links: [
      { rel: 'stylesheet', href: '/app/styles/app.css' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  React.useEffect(() => {
    void useUiSettings.persist.rehydrate()
  }, [])

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen flex flex-col bg-background font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={150}>
          <header className="shrink-0 border-b border-border">
            <nav className="mx-auto flex max-w-[100vw] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6 sm:py-4">
              <Link to="/" className="text-lg font-bold">
                Fantasy Aggregator
              </Link>
              <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2">
                <Link
                  to="/rankings"
                  search={{ leagueId: undefined }}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: 'text-sm font-medium text-foreground' }}
                >
                  Rankings
                </Link>
                <Link
                  to="/league"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: 'text-sm font-medium text-foreground' }}
                >
                  League
                </Link>
                <Link
                  to="/sync"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: 'text-sm font-medium text-foreground' }}
                >
                  Sync
                </Link>
              </div>
              <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                <LeagueRefreshButton />
                <ModeToggle />
              </div>
            </nav>
          </header>
          <main className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </main>
          </TooltipProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
