import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { POSITION_MULTI_TAGS, togglePositionTag } from '@/lib/rankings/position-multi-filter'

export function PositionMultiFilter({
  selected,
  onChange,
  className,
  size = 'default',
}: {
  selected: readonly string[]
  onChange: (next: string[]) => void
  className?: string
  /** `sm` matches h-8 toolbar controls */
  size?: 'default' | 'sm'
}) {
  const btnSize = size === 'sm' ? 'h-8 min-w-9 px-2 text-xs' : 'min-h-9'
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      <span className="text-muted-foreground mr-1 shrink-0 text-xs">Pos</span>
      <Button
        type="button"
        variant={selected.length === 0 ? 'default' : 'outline'}
        size="sm"
        className={btnSize}
        onClick={() => onChange([])}
      >
        All
      </Button>
      {POSITION_MULTI_TAGS.map((tag) => {
        const on = selected.includes(tag)
        return (
          <Button
            key={tag}
            type="button"
            variant={on ? 'default' : 'outline'}
            size="sm"
            className={btnSize}
            onClick={() => onChange(togglePositionTag(selected, tag))}
          >
            {tag}
          </Button>
        )
      })}
    </div>
  )
}
