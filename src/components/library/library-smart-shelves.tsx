"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Bookmark, CalendarClock, ChevronDown, FolderX, ImageOff, Inbox, MoreHorizontal, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/adapters/popover"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/adapters/dropdown-menu"
import { SOON_WEEK_OPTIONS, type SmartShelf } from "@/lib/library/filters"
import type { SavedViewRow } from "@/lib/library/types"

const SMART: Array<{ value: SmartShelf; label: string; icon: LucideIcon; title: string }> = [
  { value: "soon", label: "Planning soon", icon: CalendarClock, title: "Planned, with a date coming up" },
  { value: "recent", label: "Recently added", icon: Sparkles, title: "Saved in the last 30 days" },
  { value: "uncollected", label: "No collection", icon: FolderX, title: "Not in any trip or list yet" },
  { value: "nophoto", label: "Missing photo", icon: ImageOff, title: "No photo yet — each one has Find image" },
]

const chip =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
const chipOff = "bg-background text-muted-foreground hover:bg-secondary hover:text-foreground"
const chipOn = "border-transparent bg-foreground text-background"

/** The name field that saving and renaming a view share. */
function ViewNameForm({ initial, submitLabel, onSubmit, onCancel }: { initial: string; submitLabel: string; onSubmit: (name: string) => Promise<boolean>; onCancel: () => void }) {
  const [name, setName] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)
  const id = React.useId()
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim() || busy) return
        setBusy(true)
        const ok = await onSubmit(name.trim())
        setBusy(false)
        if (ok) onCancel()
      }}
      className="space-y-2.5"
    >
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
        Name this view
      </label>
      <input
        id={id}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-8 rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground">
          Cancel
        </button>
        <button type="submit" disabled={!name.trim() || busy} className="h-8 rounded-full bg-foreground px-4 text-xs font-semibold text-background disabled:opacity-50">
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  )
}

/** "Save view": names the page's current search, filters, shelf, grouping, sort and view. */
export function SaveViewButton({ suggestedName, disabled, onSave }: { suggestedName: string; disabled: boolean; onSave: (name: string) => Promise<boolean> }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={disabled ? "Search or filter first, then save it as a view" : "Save this search and filters as a shelf"}
          className={cn(chip, "border-dashed text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50")}
        >
          <Plus className="h-3.5 w-3.5" /> Save view
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="z-50 w-[280px] p-3">
        {open && <ViewNameForm initial={suggestedName} submitLabel="Save view" onSubmit={onSave} onCancel={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  )
}

function SavedViewChip({
  view,
  active,
  canUpdate,
  onApply,
  onRename,
  onUpdate,
  onDelete,
}: {
  view: SavedViewRow
  active: boolean
  canUpdate: boolean
  onApply: () => void
  onRename: (name: string) => Promise<boolean>
  onUpdate: () => void
  onDelete: () => void
}) {
  const [renaming, setRenaming] = React.useState(false)
  return (
    <Popover open={renaming} onOpenChange={setRenaming}>
      <PopoverAnchor asChild>
        <span className={cn("inline-flex h-8 shrink-0 items-center rounded-full border", active ? chipOn : "bg-background")}>
          <button
            type="button"
            aria-pressed={active}
            onClick={onApply}
            className={cn(
              "inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-l-full pl-3 pr-1.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !active && "text-foreground hover:bg-secondary"
            )}
          >
            <Bookmark className={cn("h-3.5 w-3.5", active ? "fill-current" : "text-primary")} />
            {view.name}
          </button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Options for the view ${view.name}`}
                className={cn("flex h-full w-7 items-center justify-center rounded-r-full outline-none focus-visible:ring-2 focus-visible:ring-ring", !active && "text-muted-foreground hover:bg-secondary")}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onUpdate} disabled={!canUpdate}>
                <RefreshCw className="mr-2 h-4 w-4" /> Update with current filters
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete view
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={6} className="z-50 w-[280px] p-3">
        {renaming && <ViewNameForm initial={view.name} submitLabel="Rename" onSubmit={onRename} onCancel={() => setRenaming(false)} />}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Needs review · Planning soon · Recently added · No collection · Missing photo,
 * then the user's saved views and "Save view". Live queries, not copies of
 * places; each smart shelf hides itself when it would be empty.
 */
export function LibrarySmartShelves({
  inboxCount,
  counts,
  active,
  soonWeeks,
  onSmart,
  onSoonWeeks,
  views,
  activeViewId,
  onApplyView,
  onRenameView,
  onUpdateView,
  onDeleteView,
  canSave,
  suggestedName,
  onSaveView,
}: {
  inboxCount: number
  counts: Record<SmartShelf, number>
  active: Set<SmartShelf>
  soonWeeks: number
  onSmart: (s: SmartShelf, on: boolean) => void
  onSoonWeeks: (weeks: number) => void
  views: SavedViewRow[]
  activeViewId: string | null
  onApplyView: (v: SavedViewRow) => void
  onRenameView: (v: SavedViewRow, name: string) => Promise<boolean>
  onUpdateView: (v: SavedViewRow) => void
  onDeleteView: (v: SavedViewRow) => void
  canSave: boolean
  suggestedName: string
  onSaveView: (name: string) => Promise<boolean>
}) {
  return (
    <div role="group" aria-label="Smart shelves and saved views" className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 hide-scrollbar sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
      <Link href="/inbox" className={cn(chip, chipOff, "text-foreground")}>
        <Inbox className="h-3.5 w-3.5" />
        Needs review
        {inboxCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{inboxCount}</span>}
        <ArrowRight className="h-3 w-3 opacity-60" />
      </Link>
      {SMART.map((s) => {
        const on = active.has(s.value)
        if (!on && counts[s.value] === 0) return null
        const body = (
          <>
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
            <small className="text-[11px] opacity-70">{counts[s.value]}</small>
          </>
        )
        if (s.value === "soon" && on) {
          return (
            <span key={s.value} className={cn("inline-flex h-8 shrink-0 items-center rounded-full", chipOn)}>
              <button type="button" aria-pressed onClick={() => onSmart(s.value, false)} title={s.title} className="inline-flex h-full items-center gap-1.5 rounded-l-full pl-3 pr-1.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {body}
              </button>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={`Planning window: next ${soonWeeks} weeks`} className="inline-flex h-full items-center gap-0.5 rounded-r-full border-l border-background/25 pl-2 pr-2.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {soonWeeks} wks <ChevronDown className="h-3 w-3 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Planned within the next…</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={String(soonWeeks)} onValueChange={(v) => onSoonWeeks(Number(v))}>
                    {SOON_WEEK_OPTIONS.map((w) => (
                      <DropdownMenuRadioItem key={w} value={String(w)}>
                        {w} weeks
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          )
        }
        return (
          <button key={s.value} type="button" aria-pressed={on} onClick={() => onSmart(s.value, !on)} title={s.title} className={cn(chip, on ? chipOn : chipOff)}>
            {body}
          </button>
        )
      })}
      {views.length > 0 && <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />}
      {views.map((v) => (
        <SavedViewChip
          key={v.id}
          view={v}
          active={activeViewId === v.id}
          canUpdate={canSave && activeViewId !== v.id}
          onApply={() => onApplyView(v)}
          onRename={(name) => onRenameView(v, name)}
          onUpdate={() => onUpdateView(v)}
          onDelete={() => onDeleteView(v)}
        />
      ))}
      <SaveViewButton suggestedName={suggestedName} disabled={!canSave} onSave={onSaveView} />
    </div>
  )
}
