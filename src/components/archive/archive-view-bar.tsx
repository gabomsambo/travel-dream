"use client"

import { ArrowUpDown, BookOpen, ChevronDown, LayoutGrid, List, Search, X } from "lucide-react"
import { ARCHIVE_SHORTCUTS } from "./archive-toolbar"
import { viewBarPill } from "@/components/library/library-view-bar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/adapters/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/adapters/tooltip"
import { ARCHIVE_SORTS, type ArchiveView } from "@/lib/archive/view"
import { cn } from "@/lib/utils"
import { Keyboard } from "lucide-react"

const VIEWS: Array<{ value: ArchiveView; label: string; icon: typeof List }> = [
  { value: "list", label: "List", icon: List },
  { value: "grid", label: "Gallery", icon: LayoutGrid },
  { value: "journal", label: "Journal", icon: BookOpen },
]

export function ArchiveViewBar({
  search,
  onSearch,
  filtersSlot,
  chips,
  shownCount,
  totalCount,
  sort,
  onSort,
  view,
  onView,
}: {
  search: string
  onSearch: (value: string) => void
  filtersSlot: React.ReactNode
  chips: React.ReactNode
  shownCount: number
  totalCount: number
  sort: string
  onSort: (value: string) => void
  view: ArchiveView
  onView: (value: ArchiveView) => void
}) {
  const sortLabel = ARCHIVE_SORTS.find((s) => s.value === sort)?.label ?? ARCHIVE_SORTS[0].label
  const current = VIEWS.find((v) => v.value === view) ?? VIEWS[0]

  return (
    <div className="sticky -top-3 z-20 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:-top-6">
      <div className="flex items-center gap-2 px-4 py-2.5 sm:px-8 sm:py-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search name or city"
            aria-label="Search name or city"
            className="h-9 w-full rounded-full border bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto px-4 pb-2.5 hide-scrollbar sm:px-8">
        {filtersSlot}
        <div className="hidden min-w-0 items-center lg:flex">{chips}</div>
        <span className="flex-1" />
        <span className="hidden whitespace-nowrap text-xs text-muted-foreground md:inline" aria-live="polite">
          {shownCount === totalCount ? `${totalCount} archived` : `${shownCount} of ${totalCount}`}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(viewBarPill, "border-transparent bg-transparent px-2 sm:px-3")} aria-label={`Sort: ${sortLabel}`}>
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{sortLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuRadioGroup value={sort} onValueChange={onSort}>
              {ARCHIVE_SORTS.map((s) => (
                <DropdownMenuRadioItem key={s.value} value={s.value}>
                  {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div role="radiogroup" aria-label="View" className="hidden shrink-0 gap-0.5 rounded-full border p-[3px] sm:inline-flex">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={view === v.value}
              aria-label={v.label}
              title={v.label}
              onClick={() => onView(v.value)}
              className={cn(
                "flex h-7 w-[30px] items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                view === v.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <v.icon className="h-[15px] w-[15px]" />
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(viewBarPill, "px-2.5 sm:hidden")} aria-label={`View: ${current.label}`}>
              <current.icon className="h-[15px] w-[15px]" />
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuRadioGroup value={view} onValueChange={(v) => onView(v as ArchiveView)}>
              {VIEWS.map((v) => (
                <DropdownMenuRadioItem key={v.value} value={v.value} className="gap-2">
                  <v.icon className="h-4 w-4 text-muted-foreground" /> {v.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Keyboard shortcuts" className={cn(viewBarPill, "px-2.5")}>
                <Keyboard className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <div className="font-medium">Keyboard shortcuts</div>
                <div className="space-y-0.5 text-xs">
                  {ARCHIVE_SHORTCUTS.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {chips && <div className="px-4 pb-2.5 empty:hidden sm:px-8 lg:hidden">{chips}</div>}
    </div>
  )
}
