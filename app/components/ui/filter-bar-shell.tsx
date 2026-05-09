import { type ReactNode, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type FilterBarShellProps = {
  /** When true, desktop overlay is hidden (filters minimized). */
  filtersCollapsed: boolean
  onFiltersCollapsedChange: (collapsed: boolean) => void
  /** Single-row bar (include search, triggers, settings, etc.). */
  bar: ReactNode
  /** Desktop-only overlay panel shown when `filtersCollapsed` is false. */
  desktopOverlay: ReactNode
  className?: string
}

/**
 * Keeps filter chrome to one in-flow row; expanded filters render in an absolute overlay
 * so the main page layout does not jump. Closes on outside click or Escape.
 */
export function FilterBarShell({
  filtersCollapsed,
  onFiltersCollapsedChange,
  bar,
  desktopOverlay,
  className,
}: FilterBarShellProps) {
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (filtersCollapsed) return
    const onPointerDown = (e: PointerEvent) => {
      const el = wrapRef.current
      if (!el) return
      if (!el.contains(e.target as Node)) onFiltersCollapsedChange(true)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFiltersCollapsedChange(true)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [filtersCollapsed, onFiltersCollapsedChange])

  return (
    <div ref={wrapRef} className={cn('relative min-w-0', className)}>
      {bar}
      {!filtersCollapsed ? (
        <div
          className={cn(
            'absolute left-0 right-0 top-full z-50 mt-1 hidden max-h-[min(72vh,560px)] overflow-y-auto rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg sm:block',
          )}
        >
          {desktopOverlay}
        </div>
      ) : null}
    </div>
  )
}
