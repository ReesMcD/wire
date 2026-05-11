import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Single compact row under the global nav (match ~h-12 / nav horizontal padding). */
export function PageSubheader({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode
  className?: string
  /** Merged onto the inner flex row (e.g. `lg:h-auto` when the subheader grows on large screens). */
  contentClassName?: string
}) {
  return (
    <div
      className={cn(
        'shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className,
      )}
    >
      <div
        className={cn(
          'mx-auto flex h-12 min-h-12 min-w-0 w-full max-w-[100vw] items-center gap-2 px-4 sm:px-6',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}
