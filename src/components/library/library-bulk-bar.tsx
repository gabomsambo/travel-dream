"use client"

import * as React from "react"
import {
  Archive, Check, ChevronDown, Download, FileSpreadsheet, FileText, FolderPlus, Heart, HeartOff, Keyboard, Loader2,
  MoreHorizontal, Trash2, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/adapters/dropdown-menu"
import type { ExportFormat } from "@/types/export"

export type VisitStatus = "not_visited" | "planned" | "visited"

export const STATUS_OPTIONS: Array<{ value: VisitStatus; label: string }> = [
  { value: "not_visited", label: "Want to go" },
  { value: "planned", label: "Planned" },
  { value: "visited", label: "Been" },
]

const EXPORTS: Array<{ format: ExportFormat; label: string; icon: typeof FileText }> = [
  { format: "csv", label: "CSV", icon: FileText },
  { format: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { format: "pdf", label: "PDF", icon: FileText },
]

const btn =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50 dark:hover:bg-black/10 dark:focus-visible:ring-black/50"

/**
 * The floating action bar while selecting: it stays on screen however far the
 * chapters scroll, sits above the phone's home indicator, and names the
 * selection count for screen readers as it changes.
 */
export function LibraryBulkBar({
  count,
  hiddenCount,
  shownCount,
  allShownSelected,
  busy,
  isExporting,
  allHearted,
  onSelectAll,
  onClear,
  onAddToCollection,
  onSetStatus,
  onHeart,
  onExport,
  onArchive,
  onDelete,
  onShortcuts,
}: {
  count: number
  /** Selected places the current filters hide. */
  hiddenCount: number
  shownCount: number
  allShownSelected: boolean
  busy: boolean
  isExporting: boolean
  allHearted: boolean
  onSelectAll: () => void
  onClear: () => void
  onAddToCollection: () => void
  onSetStatus: (s: VisitStatus) => void
  onHeart: (on: boolean) => void
  onExport: (format: ExportFormat) => void
  onArchive: () => void
  onDelete: () => void
  onShortcuts: () => void
}) {
  const none = count === 0
  const statusMenu = (
    <DropdownMenuContent align="center" side="top" sideOffset={10} className="w-48">
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Set {count} {count === 1 ? "place" : "places"} to…
      </DropdownMenuLabel>
      {STATUS_OPTIONS.map((s) => (
        <DropdownMenuItem key={s.value} onSelect={() => onSetStatus(s.value)}>
          <Check className="mr-2 h-4 w-4 opacity-0" aria-hidden /> {s.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  )

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={cn(
        "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-0.5 rounded-full",
        "bg-foreground py-1.5 pl-2 pr-1.5 text-background shadow-[0_14px_40px_rgba(0,0,0,.35)] md:left-[calc(50%+8rem)]",
        "animate-in fade-in-0 slide-in-from-bottom-4 duration-200"
      )}
    >
      <p className="whitespace-nowrap px-2.5 text-[13px] font-semibold tabular-nums" aria-live="polite" aria-atomic>
        {none ? "Select places" : `${count} selected`}
        {hiddenCount > 0 && <span className="ml-1 font-normal opacity-70">· {hiddenCount} hidden</span>}
      </p>
      <button
        type="button"
        onClick={allShownSelected ? onClear : onSelectAll}
        disabled={shownCount === 0}
        className={cn(btn, "hidden px-2.5 text-[12px] opacity-80 hover:opacity-100 sm:inline-flex")}
      >
        {allShownSelected ? "Clear" : `Select all ${shownCount}`}
      </button>
      <span className="mx-1 hidden h-5 w-px bg-background/25 sm:block" aria-hidden />

      <button type="button" onClick={onAddToCollection} disabled={none || busy} className={btn}>
        <FolderPlus className="h-4 w-4" />
        <span className="max-sm:sr-only">Add to collection</span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={none || busy} className={btn}>
            <Check className="h-4 w-4" />
            <span className="max-sm:sr-only">Set status</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        {statusMenu}
      </DropdownMenu>

      <button type="button" onClick={() => onHeart(!allHearted)} disabled={none || busy} className={cn(btn, "hidden md:inline-flex")}>
        {allHearted ? <HeartOff className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
        {allHearted ? "Remove hearts" : "Heart"}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={none || isExporting} className={cn(btn, "hidden md:inline-flex")}>
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" sideOffset={10}>
          {EXPORTS.map((x) => (
            <DropdownMenuItem key={x.format} onSelect={() => onExport(x.format)}>
              <x.icon className="mr-2 h-4 w-4" /> Export {count} as {x.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button type="button" onClick={onArchive} disabled={none || busy} className={cn(btn, "hidden md:inline-flex")}>
        <Archive className="h-4 w-4" /> Archive
      </button>
      <button type="button" onClick={onDelete} disabled={none || busy} className={cn(btn, "hidden text-red-300 hover:text-red-200 md:inline-flex dark:text-red-600 dark:hover:text-red-700")}>
        <Trash2 className="h-4 w-4" /> Delete
      </button>

      {/* Below md the rest sit behind ⋯, so the bar always fits a phone. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="More bulk actions" className={cn(btn, "w-9 justify-center px-0 md:hidden")}>
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" sideOffset={10} className="w-56">
          <DropdownMenuItem onSelect={allShownSelected ? onClear : onSelectAll} disabled={shownCount === 0}>
            <Check className="mr-2 h-4 w-4" /> {allShownSelected ? "Clear selection" : `Select all ${shownCount}`}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onHeart(!allHearted)} disabled={none || busy}>
            {allHearted ? <HeartOff className="mr-2 h-4 w-4" /> : <Heart className="mr-2 h-4 w-4" />}
            {allHearted ? "Remove hearts" : "Heart"}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={none || isExporting}>
              <Download className="mr-2 h-4 w-4" /> Export
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {EXPORTS.map((x) => (
                <DropdownMenuItem key={x.format} onSelect={() => onExport(x.format)}>
                  <x.icon className="mr-2 h-4 w-4" /> {x.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={onArchive} disabled={none || busy}>
            <Archive className="mr-2 h-4 w-4" /> Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} disabled={none || busy} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button type="button" onClick={onShortcuts} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" className={cn(btn, "hidden w-9 justify-center px-0 lg:inline-flex")}>
        <Keyboard className="h-4 w-4" />
      </button>
      <button type="button" onClick={onClear} aria-label="Done selecting" title="Done (Esc)" className={cn(btn, "w-9 justify-center bg-background/15 px-0")}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
