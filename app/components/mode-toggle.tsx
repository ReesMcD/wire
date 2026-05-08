'use client'

import * as React from 'react'
import { Moon, Monitor, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const cycle = ['system', 'light', 'dark'] as const

export function ModeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = React.useState(false)
  const { theme, setTheme } = useTheme()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const next = () => {
    const i = cycle.indexOf((theme ?? 'system') as (typeof cycle)[number])
    const nextTheme = cycle[(i === -1 ? 0 : i + 1) % cycle.length]
    setTheme(nextTheme)
  }

  const Icon = !mounted ? Monitor : theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  const label =
    !mounted ? 'Theme' : theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn('gap-2', className)}
      onClick={next}
      aria-label={`Theme: ${label}. Click to cycle.`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="hidden sm:inline text-muted-foreground">{label}</span>
    </Button>
  )
}
