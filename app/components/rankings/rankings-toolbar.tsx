import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Info, Settings, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageSubheader } from '@/components/ui/page-subheader'
import type { LeagueUser, Roster } from '@/lib/db/schema'
import type { NormMode } from '@/lib/rankings/player-metrics'
import type { LeagueRosterSnapshot } from '@/server/functions/sync-sleeper'
import { cn } from '@/lib/utils'

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'PICK'] as const

function rosterDisplayName(roster: Roster, users: LeagueUser[]) {
  const u = users.find((x) => x.userId === roster.ownerId)
  return u?.teamName ?? u?.displayName ?? `Roster ${roster.rosterId}`
}

function teamSummaryLabel(count: number) {
  if (count === 0) return 'All teams'
  return `Teams (${count})`
}

function TeamRosterChecklist({
  rosterOptions,
  users,
  highlightTeamIds,
  onToggle,
  onClear,
  className,
}: {
  rosterOptions: Roster[]
  users: LeagueUser[]
  highlightTeamIds: number[]
  onToggle: (rosterId: number) => void
  onClear: () => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {rosterOptions.map((r) => {
          const id = `rankings-team-${r.rosterId}`
          const checked = highlightTeamIds.includes(r.rosterId)
          return (
            <div key={r.rosterId} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={id}
                checked={checked}
                onChange={() => onToggle(r.rosterId)}
                className="size-4 shrink-0 rounded border-input accent-primary"
              />
              <Label htmlFor={id} className="cursor-pointer text-sm font-normal leading-tight">
                {rosterDisplayName(r, users)}
              </Label>
            </div>
          )
        })}
      </div>
      <div className="flex justify-end border-t border-border pt-2">
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onClear}>
          Clear teams
        </Button>
      </div>
    </div>
  )
}

export type RankingsToolbarProps = {
  leagueSnapshot: LeagueRosterSnapshot | null
  searchLeagueId: string | undefined
  globalFilter: string
  onGlobalFilterChange: (v: string) => void
  positionFilter: string | null
  onPositionFilterChange: (v: string | null) => void
  normMode: NormMode
  onNormModeChange: (v: NormMode) => void
  hidePickRows: boolean
  onHidePickRowsChange: (v: boolean) => void
  dynastyGroupVisible: boolean
  redraftGroupVisible: boolean
  onToggleDynastyColumns: () => void
  onToggleRedraftColumns: () => void
  highlightAvailable: boolean
  onHighlightAvailableChange: (v: boolean) => void
  highlightTeamIds: number[]
  onToggleHighlightTeam: (rosterId: number) => void
  onClearHighlightTeams: () => void
  hideUnhighlighted: boolean
  onHideUnhighlightedChange: (v: boolean) => void
}

function FilterBlock({
  leagueSnapshot,
  positionFilter,
  onPositionFilterChange,
  normMode,
  onNormModeChange,
  hidePickRows,
  onHidePickRowsChange,
  dynastyGroupVisible,
  redraftGroupVisible,
  onToggleDynastyColumns,
  onToggleRedraftColumns,
  highlightAvailable,
  onHighlightAvailableChange,
  hideUnhighlighted,
  onHideUnhighlightedChange,
  teamList,
  direction,
}: {
  leagueSnapshot: LeagueRosterSnapshot | null
  positionFilter: string | null
  onPositionFilterChange: (v: string | null) => void
  normMode: NormMode
  onNormModeChange: (v: NormMode) => void
  hidePickRows: boolean
  onHidePickRowsChange: (v: boolean) => void
  dynastyGroupVisible: boolean
  redraftGroupVisible: boolean
  onToggleDynastyColumns: () => void
  onToggleRedraftColumns: () => void
  highlightAvailable: boolean
  onHighlightAvailableChange: (v: boolean) => void
  hideUnhighlighted: boolean
  onHideUnhighlightedChange: (v: boolean) => void
  teamList: ReactNode
  direction: 'row' | 'column'
}) {
  const rowCls = 'flex flex-wrap items-center gap-2'
  return (
    <div className={direction === 'row' ? rowCls : 'flex flex-col gap-3'}>
      <Select
        value={positionFilter ?? 'all'}
        onValueChange={(v) => onPositionFilterChange(v === 'all' ? null : v)}
      >
        <SelectTrigger size="sm" className="h-8 w-[6.5rem]">
          <SelectValue placeholder="Position" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {POSITIONS.map((pos) => (
            <SelectItem key={pos} value={pos}>
              {pos}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className={cn(rowCls, direction === 'column' && 'border-border border-t pt-2')}>
        <span className="text-muted-foreground text-xs">Scale</span>
        <Button
          type="button"
          variant={normMode === 'max' ? 'default' : 'outline'}
          size="sm"
          className="h-8"
          onClick={() => onNormModeChange('max')}
        >
          Max
        </Button>
        <Button
          type="button"
          variant={normMode === 'quantile' ? 'default' : 'outline'}
          size="sm"
          className="h-8"
          onClick={() => onNormModeChange('quantile')}
        >
          Quantile
        </Button>
      </div>

      <Button
        type="button"
        variant={hidePickRows ? 'default' : 'outline'}
        size="sm"
        className="h-8"
        onClick={() => onHidePickRowsChange(!hidePickRows)}
      >
        Hide picks
      </Button>

      <div className={cn(rowCls, direction === 'column' && 'border-border border-t pt-2')}>
        <span className="text-muted-foreground text-xs">Columns</span>
        <Button
          type="button"
          variant={dynastyGroupVisible ? 'default' : 'outline'}
          size="sm"
          className="h-8"
          onClick={onToggleDynastyColumns}
        >
          Dynasty
        </Button>
        <Button
          type="button"
          variant={redraftGroupVisible ? 'default' : 'outline'}
          size="sm"
          className="h-8"
          onClick={onToggleRedraftColumns}
        >
          Redraft
        </Button>
      </div>

      {leagueSnapshot ? (
        <>
          <div className={cn(rowCls, direction === 'column' && 'border-border border-t pt-2')}>
            <span className="text-muted-foreground text-xs">Highlight</span>
            <Button
              type="button"
              size="sm"
              className="h-8"
              variant={highlightAvailable ? 'default' : 'outline'}
              onClick={() => onHighlightAvailableChange(!highlightAvailable)}
            >
              Available
            </Button>
            {direction === 'column' ? teamList : null}
          </div>
          <div className={cn(rowCls, direction === 'column' && 'items-stretch')}>
            <Button
              type="button"
              size="sm"
              className="h-8"
              variant={hideUnhighlighted ? 'default' : 'outline'}
              onClick={() => onHideUnhighlightedChange(!hideUnhighlighted)}
            >
              Hide unhighlighted
            </Button>
            <span className="text-muted-foreground max-w-full text-xs leading-snug">
              On: only rows matching highlight toggles stay.
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}

export function RankingsToolbar({
  leagueSnapshot,
  searchLeagueId,
  globalFilter,
  onGlobalFilterChange,
  positionFilter,
  onPositionFilterChange,
  normMode,
  onNormModeChange,
  hidePickRows,
  onHidePickRowsChange,
  dynastyGroupVisible,
  redraftGroupVisible,
  onToggleDynastyColumns,
  onToggleRedraftColumns,
  highlightAvailable,
  onHighlightAvailableChange,
  highlightTeamIds,
  onToggleHighlightTeam,
  onClearHighlightTeams,
  hideUnhighlighted,
  onHideUnhighlightedChange,
}: RankingsToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const rosterOptions = leagueSnapshot?.rosters ?? []
  const users = leagueSnapshot?.users ?? []

  const teamPopover = leagueSnapshot ? (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 max-w-[9rem] shrink-0 truncate">
          {teamSummaryLabel(highlightTeamIds.length)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <p className="text-muted-foreground mb-2 text-xs">Highlight roster rows</p>
        <TeamRosterChecklist
          rosterOptions={rosterOptions}
          users={users}
          highlightTeamIds={highlightTeamIds}
          onToggle={onToggleHighlightTeam}
          onClear={onClearHighlightTeams}
        />
      </PopoverContent>
    </Popover>
  ) : null

  const leagueMetaTooltip =
    leagueSnapshot != null ? (
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-medium">{leagueSnapshot.league.name}</span>
          <span className="text-muted-foreground"> · {leagueSnapshot.league.season}</span>
        </p>
        <p className="text-muted-foreground text-xs">Norm scale: {normMode}</p>
      </div>
    ) : searchLeagueId ? (
      <p className="text-sm text-amber-600 dark:text-amber-500">
        League id in URL but snapshot missing — check Settings or refresh.
      </p>
    ) : (
      <p className="text-muted-foreground text-sm">
        No league loaded for highlights. Set a default league in Settings.
      </p>
    )

  const filterPanel = (
    <FilterBlock
      leagueSnapshot={leagueSnapshot}
      positionFilter={positionFilter}
      onPositionFilterChange={onPositionFilterChange}
      normMode={normMode}
      onNormModeChange={onNormModeChange}
      hidePickRows={hidePickRows}
      onHidePickRowsChange={onHidePickRowsChange}
      dynastyGroupVisible={dynastyGroupVisible}
      redraftGroupVisible={redraftGroupVisible}
      onToggleDynastyColumns={onToggleDynastyColumns}
      onToggleRedraftColumns={onToggleRedraftColumns}
      highlightAvailable={highlightAvailable}
      onHighlightAvailableChange={onHighlightAvailableChange}
      hideUnhighlighted={hideUnhighlighted}
      onHideUnhighlightedChange={onHideUnhighlightedChange}
      direction="row"
      teamList={null}
    />
  )

  return (
    <PageSubheader>
      <div className="relative h-12 w-full min-w-0">
        <div className="absolute inset-0 z-[1] hidden min-w-0 items-center gap-2 sm:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="text-muted-foreground size-8 shrink-0">
              <Info className="size-4" />
              <span className="sr-only">League context</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            {leagueMetaTooltip}
          </TooltipContent>
        </Tooltip>
        <Input
          placeholder="Search players…"
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
          className="h-8 min-w-0 flex-1 max-w-[min(100%,20rem)]"
        />
        {teamPopover}
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              title="More filters"
            >
              <SlidersHorizontal className="size-4" />
              <span className="sr-only">More filters</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[min(72vh,520px)] w-[min(calc(100vw-2rem),40rem)] overflow-y-auto p-3"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {filterPanel}
          </PopoverContent>
        </Popover>
        <Link to="/settings" className="ml-auto shrink-0">
          <Button type="button" variant="ghost" size="icon" className="size-8" title="Settings">
            <Settings className="size-4" />
            <span className="sr-only">Settings</span>
          </Button>
        </Link>
        </div>

        <div className="absolute inset-0 z-[1] flex min-w-0 items-center gap-2 sm:hidden">
        <Input
          placeholder="Search…"
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
          className="h-9 min-w-0 flex-1"
        />
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="size-9 shrink-0" title="Filters">
              <SlidersHorizontal className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="flex h-[min(75vh,560px)] flex-col overflow-hidden">
            <SheetHeader className="shrink-0">
              <SheetTitle>Rankings filters</SheetTitle>
            </SheetHeader>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <FilterBlock
                leagueSnapshot={leagueSnapshot}
                positionFilter={positionFilter}
                onPositionFilterChange={onPositionFilterChange}
                normMode={normMode}
                onNormModeChange={onNormModeChange}
                hidePickRows={hidePickRows}
                onHidePickRowsChange={onHidePickRowsChange}
                dynastyGroupVisible={dynastyGroupVisible}
                redraftGroupVisible={redraftGroupVisible}
                onToggleDynastyColumns={onToggleDynastyColumns}
                onToggleRedraftColumns={onToggleRedraftColumns}
                highlightAvailable={highlightAvailable}
                onHighlightAvailableChange={onHighlightAvailableChange}
                hideUnhighlighted={hideUnhighlighted}
                onHideUnhighlightedChange={onHideUnhighlightedChange}
                direction="column"
                teamList={
                  leagueSnapshot ? (
                    <div className="mt-2">
                      <p className="text-muted-foreground mb-2 text-xs">Teams</p>
                      <TeamRosterChecklist
                        rosterOptions={rosterOptions}
                        users={users}
                        highlightTeamIds={highlightTeamIds}
                        onToggle={onToggleHighlightTeam}
                        onClear={onClearHighlightTeams}
                      />
                    </div>
                  ) : null
                }
              />
            </div>
          </SheetContent>
        </Sheet>
        <Link to="/settings">
          <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" title="Settings">
            <Settings className="size-4" />
          </Button>
        </Link>
        </div>
      </div>
    </PageSubheader>
  )
}
