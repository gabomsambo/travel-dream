"use client"

// The journal, the compact list and the map's side list: one place per row, windowed
// by VirtualRows (see there). A place's row only knows its own state, so a heart or a
// selection re-renders the rows on screen, not the library.

import * as React from "react"
import { ChevronRight, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { FallbackArt } from "@/components/explore/fallback-art"
import { Photo } from "@/components/photo"
import { kindLabel } from "@/components/explore/kind-icon"
import { flagFor } from "@/lib/explore/geo"
import { fullDate, locationOf, monthYear, type Chapter } from "@/lib/library/chapters"
import { buildEntryRows, entryChapterKey, type EntryRow, type EntryView } from "@/lib/library/entry-rows"
import type { GroupMode, LibraryItem } from "@/lib/library/types"
import { useLibraryActions, useLongPress } from "./library-actions"
import { CityChips } from "./library-chapter-parts"
import { HeartButton, LibraryPlaceMenu, SelectMark } from "./library-place-menu"
import { mainOf, useMediaQuery, VirtualRows, type VirtualRowsHandle } from "./virtual-rows"

const NO_COLLECTIONS = new Map<string, string[]>()

type Entry = Extract<EntryRow, { kind: "entry" }>

/** A row or entry that starts Select mode on a long press (touch only). */
function Pressable({ id, as: Tag = "div", ...props }: { id: string; as?: "div" | "article" } & React.HTMLAttributes<HTMLElement>) {
  const a = useLibraryActions()
  const press = useLongPress(() => a.select(id), !a.selecting)
  return <Tag {...props} {...press} />
}

function Stars({ n }: { n: number }) {
  if (!n) return null
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500 [[data-theme=tropical]_&]:text-accent" aria-label={`Rated ${n} of 5`}>
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} className="h-3 w-3 fill-current" />
      ))}
    </span>
  )
}

function StatusPill({ p, long = false }: { p: LibraryItem; long?: boolean }) {
  if (p.visitStatus === "visited") {
    const when = long ? fullDate(p.lastVisited) : null
    return <span className="whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">✓ Been{when ? ` · ${when}` : ""}</span>
  }
  if (p.visitStatus === "planned") {
    const when = long ? fullDate(p.plannedVisit) : null
    return <span className="whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Planned{when ? ` · ${when}` : ""}</span>
  }
  return <span className="whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">Dreaming</span>
}

function Thumb({ p, className, sizes, small = false }: { p: LibraryItem; className?: string; sizes: string; small?: boolean }) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-muted", className)}>
      {p.photos[0] ? (
        <Photo src={p.photos[0].uri} thumb={p.photos[0].thumb} use={small ? "thumb" : "full"} sizes={sizes} />
      ) : (
        <FallbackArt name={p.name} kind={p.kind} />
      )}
    </div>
  )
}

/** A trip read as a diary: photo, serif name, your note as a quote, the day you went. */
function JournalEntry({ row, siblings }: { row: Entry; siblings: string[] }) {
  const a = useLibraryActions()
  const { item: p } = row
  const checked = a.selected.has(p.id)
  return (
    <Pressable
      as="article"
      id={p.id}
      aria-setsize={row.setSize}
      aria-posinset={row.pos}
      className={cn(
        "grid max-w-[980px] grid-cols-[96px_minmax(0,1fr)] gap-4 border-b py-4 [-webkit-touch-callout:none] sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-5",
        row.last && "mb-10 sm:mb-12",
        checked && "bg-primary/5"
      )}
    >
      <button
        type="button"
        onClick={(e) => a.activate(p.id, siblings, { shiftKey: e.shiftKey })}
        aria-label={`${p.name}, ${locationOf(p)}`}
        className="group relative aspect-square overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:aspect-[4/3] sm:rounded-2xl"
      >
        <Thumb p={p} sizes="(min-width: 640px) 240px, 96px" className="absolute inset-0 transition duration-700 group-hover:scale-[1.04]" />
      </button>
      <div className="min-w-0 sm:pt-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {flagFor(p.country) && <span className="mr-1">{flagFor(p.country)}</span>}
            {locationOf(p) || "Somewhere"} · {kindLabel(p.kind)}
          </p>
          {a.selecting && <SelectMark checked={checked} label={`Select ${p.name}`} onToggle={(e) => a.toggleSelect(p.id, { shiftKey: e.shiftKey })} tone="plain" />}
          <HeartButton id={p.id} name={p.name} className="h-7 w-7 bg-secondary text-foreground backdrop-blur-none hover:bg-secondary/80" />
          <LibraryPlaceMenu item={p} siblings={siblings} tone="plain" />
        </div>
        <h3>
          <button
            type="button"
            data-place-id={p.id}
            onClick={(e) => a.activate(p.id, siblings, { shiftKey: e.shiftKey })}
            className="mt-1 text-left font-editorial text-[28px] leading-none outline-none hover:underline focus-visible:underline sm:text-[38px]"
          >
            {p.name}
          </button>
        </h3>
        {p.notes?.trim() ? (
          <blockquote className="mt-2.5 border-l-2 border-primary pl-3.5 font-editorial text-lg italic leading-tight sm:text-[21px]">“{p.notes.trim()}”</blockquote>
        ) : p.description ? (
          <p className="mt-2 line-clamp-3 max-w-[560px] text-sm text-muted-foreground">{p.description}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <StatusPill p={p} long />
          <Stars n={p.ratingSelf} />
          {p.recommendedBy && <span>Tip from {p.recommendedBy}</span>}
          {p.bestTimeText && p.visitStatus !== "visited" && <span>Best: {p.bestTimeText}</span>}
          {monthYear(p.createdAt) && <span>Saved {monthYear(p.createdAt)}</span>}
        </div>
      </div>
    </Pressable>
  )
}

const LIST_COLS = "md:grid-cols-[22px_44px_minmax(0,2fr)_minmax(0,1.2fr)_110px_92px_76px_minmax(0,1.3fr)_76px_28px]"

function ListColumns({ index }: { index: number }) {
  return (
    <div role="row" aria-rowindex={index} className={cn("hidden items-center gap-3 border-b px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid", LIST_COLS)}>
      <span role="columnheader"><span className="sr-only">Select</span></span>
      <span role="columnheader"><span className="sr-only">Photo</span></span>
      <span role="columnheader">Name</span>
      <span role="columnheader">Where</span>
      <span role="columnheader">Kind</span>
      <span role="columnheader">Status</span>
      <span role="columnheader">Rating</span>
      <span role="columnheader">Collections</span>
      <span role="columnheader">Saved</span>
      <span role="columnheader"><span className="sr-only">Actions</span></span>
    </div>
  )
}

/** The dense mode: one row per place, thumbnails kept, no table to squeeze onto a phone. */
function ListEntry({ row, index, siblings, collectionNames }: { row: Entry; index: number; siblings: string[]; collectionNames: Map<string, string[]> }) {
  const a = useLibraryActions()
  const { item: p } = row
  const checked = a.selected.has(p.id)
  const inCollections = collectionNames.get(p.id) ?? []
  return (
    <Pressable
      id={p.id}
      role="row"
      aria-rowindex={index}
      className={cn(
        "grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border-b px-2 py-2 text-[13px] transition [-webkit-touch-callout:none] hover:bg-secondary/40",
        LIST_COLS,
        row.last && "mb-10 sm:mb-12",
        checked && "bg-primary/5"
      )}
    >
      <span role="cell" className="hidden md:block">
        <SelectMark checked={checked} label={`Select ${p.name}`} onToggle={(e) => a.toggleSelect(p.id, { shiftKey: e.shiftKey })} tone="plain" className="h-[18px] w-[18px]" />
      </span>
      <span role="cell" className="relative">
        <button type="button" onClick={(e) => a.activate(p.id, siblings, { shiftKey: e.shiftKey })} aria-label={`Open ${p.name}`} className="block rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Thumb p={p} small sizes="56px" className="h-14 w-14 rounded-xl md:h-11 md:w-11 md:rounded-[10px]" />
        </button>
        {a.selecting && (
          <SelectMark checked={checked} label={`Select ${p.name}`} onToggle={(e) => a.toggleSelect(p.id, { shiftKey: e.shiftKey })} className="absolute -left-1 -top-1 md:hidden" />
        )}
      </span>
      <span role="cell" className="min-w-0">
        <button type="button" data-place-id={p.id} onClick={(e) => a.activate(p.id, siblings, { shiftKey: e.shiftKey })} className="block max-w-full truncate text-left font-semibold outline-none hover:underline focus-visible:underline">
          {p.name}
        </button>
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground md:hidden">
          <span className="truncate">{[p.city, kindLabel(p.kind)].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="mt-1 block md:hidden"><StatusPill p={p} /></span>
      </span>
      <span role="cell" className="hidden truncate text-muted-foreground md:block">{locationOf(p) || "—"}</span>
      <span role="cell" className="hidden md:block">
        <span className="rounded-full border px-2 py-0.5 text-[11px]">{kindLabel(p.kind)}</span>
      </span>
      <span role="cell" className="hidden md:block"><StatusPill p={p} /></span>
      <span role="cell" className="hidden md:block">{p.ratingSelf ? <Stars n={p.ratingSelf} /> : <span className="text-muted-foreground">—</span>}</span>
      <span role="cell" className="hidden truncate text-muted-foreground md:block">{inCollections.length ? inCollections.join(", ") : "—"}</span>
      <span role="cell" className="hidden text-muted-foreground md:block">{monthYear(p.createdAt) ?? "—"}</span>
      <span role="cell" className="flex justify-end">
        <LibraryPlaceMenu item={p} siblings={siblings} tone="plain" />
      </span>
    </Pressable>
  )
}

/** The map's side list: a place beside the pins, opened from the list. */
function MapEntry({ row, siblings }: { row: Entry; siblings: string[] }) {
  const a = useLibraryActions()
  const { item: p } = row
  return (
    <div
      aria-setsize={row.setSize}
      aria-posinset={row.pos}
      className={cn("flex items-center gap-3 py-2", row.last && "mb-4", a.selected.has(p.id) && "rounded-xl bg-primary/5")}
    >
      <button
        type="button"
        data-place-id={p.id}
        onClick={(e) => a.activate(p.id, siblings, { shiftKey: e.shiftKey })}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-16 sm:w-16">
          {p.photos[0] ? (
            <Photo src={p.photos[0].uri} thumb={p.photos[0].thumb} use="thumb" sizes="64px" />
          ) : (
            <FallbackArt name={p.name} kind={p.kind} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[p.city, kindLabel(p.kind)].filter(Boolean).join(" · ")}
            {p.lat === null && " · not on the map"}
          </span>
        </span>
        {/* Badge colours mirror the map pins and the legend under Passport. */}
        {p.visitStatus === "visited" ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Been</span>
        ) : p.visitStatus === "planned" ? (
          <span className="rounded-full bg-[hsl(var(--map-planned))] px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--map-planned-foreground))]">Planned</span>
        ) : null}
      </button>
      <LibraryPlaceMenu item={p} siblings={siblings} tone="plain" />
    </div>
  )
}

const EntryRowView = React.memo(function EntryRowView({
  row,
  index,
  view,
  siblings,
  collectionNames,
  header,
  showCities,
  onCity,
  onOpen,
  interlude,
}: {
  row: EntryRow
  /** 1-based position among all rows, for a table's `aria-rowindex`. */
  index: number
  view: EntryView
  siblings: string[]
  collectionNames: Map<string, string[]>
  header: (chapter: Chapter, cityChips: React.ReactNode) => React.ReactNode
  showCities: boolean
  onCity: (chapterKey: string, city: string | null) => void
  onOpen: (chapterKey: string, limit: number) => void
  interlude?: React.ReactNode
}) {
  // A table's rows hold cells; anything else in it (a chapter's heading, "more") gets one.
  const cell = (children: React.ReactNode) =>
    view === "list" ? (
      <div role="row" aria-rowindex={index}>
        <div role="cell">{children}</div>
      </div>
    ) : (
      children
    )
  switch (row.kind) {
    case "interlude":
      return cell(<div className="mb-10 sm:hidden">{interlude}</div>)
    case "columns":
      return <ListColumns index={index} />
    case "header": {
      const { chapter } = row
      const chips = showCities ? <CityChips items={chapter.items} city={row.city} onCity={(c) => onCity(chapter.key, c)} /> : null
      return cell(
        <div id={`chapter-${chapter.key}`} data-chapter={chapter.key}>
          {header(chapter, chips)}
        </div>
      )
    }
    case "more":
      return cell(
        <button type="button" onClick={() => onOpen(row.chapter.key, row.open)} className="mb-10 mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline sm:mb-12">
          {view === "list" ? `Show ${row.hidden} more` : `${row.hidden} more ${row.hidden === 1 ? "entry" : "entries"}`} <ChevronRight className="h-4 w-4" />
        </button>
      )
    case "entry":
      if (view === "map") return <MapEntry row={row} siblings={siblings} />
      if (view === "list") return <ListEntry row={row} index={index} siblings={siblings} collectionNames={collectionNames} />
      return <JournalEntry row={row} siblings={siblings} />
  }
})

/**
 * What the compact list, the journal and the map's side list measure before they are measured:
 * close to the rows at 5,000 places, so the scrollbar barely moves as they are.
 */
function estimateEntry(row: EntryRow, view: EntryView, wide: boolean, phone: boolean, chips: boolean): number {
  switch (row.kind) {
    case "interlude":
      return phone ? 360 : 0
    case "columns":
      return wide ? 31 : 0
    case "more":
      return 76
    case "header":
      return (row.chapter.eyebrow ? 21 : 0) + (view === "map" ? 45 : phone ? 74 : 92) + (chips ? (phone ? 44 : 112) : 0)
    case "entry":
      if (view === "map") return (phone ? 72 : 80) + (row.last ? 16 : 0)
      if (view === "list") return (wide ? 61 : 73) + (row.last ? (phone ? 40 : 48) : 0)
      return (phone ? 129 : 213) + (row.last ? (phone ? 40 : 48) : 0)
  }
}

export function VirtualEntries({
  chapters,
  group,
  view,
  siblings,
  collectionNames = NO_COLLECTIONS,
  interlude,
  header,
  onActive,
  handle,
}: {
  chapters: Chapter[]
  group: GroupMode
  view: EntryView
  siblings: string[]
  /** Who each place is in, for the list's Collections column. */
  collectionNames?: Map<string, string[]>
  /** Phones only: shown after the first chapter, so the first places come right under the tools. */
  interlude?: React.ReactNode
  header: (chapter: Chapter, cityChips: React.ReactNode) => React.ReactNode
  /** The chapter under the sticky tools, for the index. */
  onActive?: (chapterKey: string | null) => void
  handle?: React.MutableRefObject<VirtualRowsHandle | null>
}) {
  const [limits, setLimits] = React.useState<ReadonlyMap<string, number>>(() => new Map())
  const [cityBy, setCityBy] = React.useState<ReadonlyMap<string, string | null>>(() => new Map())
  const hasInterlude = !!interlude
  const wide = useMediaQuery("(min-width: 768px)", true)
  const phone = !useMediaQuery("(min-width: 640px)", true)
  const rows = React.useMemo(
    () => buildEntryRows(chapters, { view, group, limits, cityBy, columns: view === "list" && wide, interlude: hasInterlude && phone }),
    [chapters, view, group, limits, cityBy, hasInterlude, wide, phone]
  )
  const chips = group === "country" && view === "journal"
  const estimate = React.useCallback((row: EntryRow) => estimateEntry(row, view, wide, phone, chips), [view, wide, phone, chips])

  const onOpen = React.useCallback((key: string, limit: number) => setLimits((m) => new Map(m).set(key, limit)), [])
  const onCity = React.useCallback((key: string, city: string | null) => setCityBy((m) => new Map(m).set(key, city)), [])

  return (
    <VirtualRows
      rows={rows}
      estimate={estimate}
      layoutKey={`${wide}:${phone}`}
      chapterOf={entryChapterKey}
      onActive={onActive}
      handle={handle}
      // The map's side list scrolls itself beside the map from lg up; below that it is part of the page.
      scrollParent={view === "map" ? sideListScroller : mainOf}
      listProps={view === "list" ? { role: "table", "aria-label": "Places", "aria-rowcount": rows.length } : undefined}
      rowRole={view === "list" ? "presentation" : undefined}
      render={(row, i) => (
        <EntryRowView
          row={row}
          index={i + 1}
          view={view}
          siblings={siblings}
          collectionNames={collectionNames}
          header={header}
          showCities={chips}
          onCity={onCity}
          onOpen={onOpen}
          interlude={interlude}
        />
      )}
    />
  )
}

/** From lg the map's list is its own scroll box; below that <main> scrolls it with the rest of the page. */
function sideListScroller(list: HTMLElement): HTMLElement | null {
  return window.matchMedia("(min-width: 1024px)").matches ? list.closest<HTMLElement>("[data-side-list]") : mainOf(list)
}
