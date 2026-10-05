"use client"

import {
  ArrowUpDown, BookOpen, Calendar, Check, ChevronDown, Download, FileSpreadsheet, FileText, Folder, Globe2,
  LayoutGrid, Layers, List, Loader2, Map, MapPin, Rows3, SquareCheck, Sun, Tag, X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/adapters/dropdown-menu"
import { GROUP_MODES } from "@/lib/library/chapters"
import { SORTS } from "@/lib/library/filters"
import type { ExportFormat } from "@/types/export"
import type { GroupMode, LibraryView } from "@/lib/library/types"

const GROUP_ICONS: Record<GroupMode, LucideIcon> = {
  country: Globe2, city: MapPin, collection: Folder, shelf: Check, kind: Tag, month: Sun, saved: Calendar, none: Rows3,
}

export const VIEW_OPTIONS: Array<{ value: LibraryView; label: string; icon: LucideIcon }> = [
  { value: "grid", label: "Gallery", icon: LayoutGrid },
  { value: "journal", label: "Journal", icon: BookOpen },
  { value: "list", label: "Compact list", icon: List },
  { value: "map", label: "Map", icon: Map },
]

const pill =
  "inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border bg-background px-3 text-xs font-medium outline-none transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"

/**
 * The one row of tools under the cover: how the chapters are grouped, the
 * filter panel, the active filters, sort, the four views, export and select.
 * Sticks under the app header while the chapters scroll.
 */
export function LibraryViewBar({
  showGroup = true,
  group,
  onGroup,
  filtersSlot,
  chips,
  shownCount,
  totalCount,
  sort,
  onSort,
  view,
  onView,
  exportLabel,
  exportDisabled,
  isExporting,
  onExport,
  selecting,
  onSelectToggle,
  below,
}: {
  /** False while the page is too small to group (the sparse grid). */
  showGroup?: boolean
  group: GroupMode
  onGroup: (g: GroupMode) => void
  filtersSlot: React.ReactNode
  chips: React.ReactNode
  shownCount: number
  totalCount: number
  sort: string
  onSort: (s: string) => void
  view: LibraryView
  onView: (v: LibraryView) => void
  exportLabel: string
  exportDisabled: boolean
  isExporting: boolean
  onExport: (format: ExportFormat) => void
  selecting: boolean
  onSelectToggle: () => void
  /** Rendered inside the sticky block, under the tools (the selection toolbar). */
  below?: React.ReactNode
}) {
  const groupLabel = GROUP_MODES.find((g) => g.value === group)?.label ?? "Country"
  const sortLabel = SORTS.find((s) => s.value === sort)?.label ?? SORTS[0].label
  const current = VIEW_OPTIONS.find((v) => v.value === view) ?? VIEW_OPTIONS[0]

  return (
    // The (app) <main> scrolls with 12/24px padding; the negative top pins the bar to its very top edge.
    <div className="sticky -top-3 z-20 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:-top-6">
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-2.5 hide-scrollbar sm:px-8 sm:py-3">
        {showGroup && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={pill} aria-label={`Group by ${groupLabel}`}>
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Group:</span> <b className="font-semibold">{groupLabel}</b>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[340px] max-w-[calc(100vw-2rem)]">
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Group the library by
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={group} onValueChange={(v) => onGroup(v as GroupMode)}>
              {GROUP_MODES.map((g) => {
                const Icon = GROUP_ICONS[g.value]
                return (
                  <DropdownMenuRadioItem key={g.value} value={g.value} className="gap-2.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 whitespace-nowrap">{g.label}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{g.hint}</span>
                  </DropdownMenuRadioItem>
                )
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        )}

        {filtersSlot}
        <div className="hidden min-w-0 items-center lg:flex">{chips}</div>

        <span className="flex-1 max-sm:order-2" />
        <span className="hidden whitespace-nowrap text-xs text-muted-foreground md:inline" aria-live="polite">
          {shownCount === totalCount ? `${totalCount} places` : `${shownCount} of ${totalCount}`}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(pill, "border-transparent bg-transparent px-2 max-sm:order-5 sm:px-3")} aria-label={`Sort: ${sortLabel}`}>
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{sortLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuRadioGroup value={sort} onValueChange={onSort}>
              {SORTS.map((s) => (
                <DropdownMenuRadioItem key={s.value} value={s.value}>
                  {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div role="radiogroup" aria-label="View" className="hidden shrink-0 gap-0.5 rounded-full border p-[3px] sm:inline-flex">
          {VIEW_OPTIONS.map((v) => (
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
            <button type="button" className={cn(pill, "px-2.5 max-sm:order-3 sm:hidden")} aria-label={`View: ${current.label}`}>
              <current.icon className="h-[15px] w-[15px]" />
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuRadioGroup value={view} onValueChange={(v) => onView(v as LibraryView)}>
              {VIEW_OPTIONS.map((v) => (
                <DropdownMenuRadioItem key={v.value} value={v.value} className="gap-2">
                  <v.icon className="h-4 w-4 text-muted-foreground" /> {v.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(pill, "max-sm:order-6")} disabled={exportDisabled || isExporting} aria-label={exportLabel}>
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{exportLabel}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExport("csv")}>
              <FileText className="mr-2 h-4 w-4" /> Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("xlsx")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("pdf")}>
              <FileText className="mr-2 h-4 w-4" /> Export as PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          aria-pressed={selecting}
          onClick={onSelectToggle}
          className={cn(pill, "max-sm:order-4", selecting && "border-transparent bg-foreground text-background hover:bg-foreground/90")}
        >
          {selecting ? <X className="h-3.5 w-3.5" /> : <SquareCheck className="h-3.5 w-3.5" />}
          {selecting ? "Done" : "Select"}
        </button>
      </div>
      {chips && <div className="px-4 pb-2.5 empty:hidden sm:px-8 lg:hidden">{chips}</div>}
      {below}
    </div>
  )
}

export const viewBarPill = pill
