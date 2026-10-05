"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, ChevronRight, Globe2, Shuffle, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import * as Dialog from "@radix-ui/react-dialog"
import { FallbackArt } from "@/components/explore/fallback-art"
import { kindLabel } from "@/components/explore/kind-icon"
import { editorialFont } from "@/components/explore/fonts"
import { flagFor } from "@/lib/explore/geo"
import { chapterSummary, citiesOf, fullDate, locationOf, monthYear, type Chapter } from "@/lib/library/chapters"
import type { GroupMode, LibraryItem, LibraryView } from "@/lib/library/types"
import { useLibraryActions } from "./library-actions"
import { LibraryTile } from "./library-tile"
import { HeartButton, LibraryPlaceMenu, SelectMark } from "./library-place-menu"

/** Header of one chapter: flag, serif name, the counts, and where it continues. */
function ChapterHeader({ chapter, group, items, collage }: { chapter: Chapter; group: GroupMode; items: LibraryItem[]; collage?: boolean }) {
  const photos = collage ? items.filter((p) => p.photos.length).slice(0, 3).map((p) => p.photos[0].thumb) : []
  const isCountry = group === "country" && chapter.key !== "country:none"
  return (
    <div className="mb-3.5 flex flex-wrap items-end gap-x-4 gap-y-2">
      {collage && photos.length > 0 ? (
        <div className="grid aspect-[4/3] w-24 shrink-0 grid-cols-[2fr_1fr] grid-rows-2 gap-[2px] overflow-hidden rounded-xl bg-muted sm:w-[120px]">
          {photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src + i} src={src} alt="" loading="lazy" className={cn("h-full w-full object-cover", i === 0 && "row-span-2")} />
          ))}
        </div>
      ) : (
        chapter.flag && <span className="text-[30px] leading-none sm:text-[40px]" aria-hidden>{chapter.flag}</span>
      )}
      <div className="min-w-0">
        {chapter.eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{chapter.eyebrow}</p>
        )}
        <h2 className="font-editorial text-[38px] leading-[0.9] sm:text-[56px]">{chapter.title}</h2>
        <p className="mt-2 text-[12px] text-muted-foreground sm:text-[13px]">{chapterSummary(items, group !== "city")}</p>
      </div>
      {chapter.href && (
        <div className="ml-auto hidden items-center gap-3 pb-1 sm:flex">
          {isCountry && (
            <Link
              href={`/explore/shuffle?country=${encodeURIComponent(chapter.href.split("/").pop() ?? "")}`}
              className="hidden items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              <Shuffle className="h-3.5 w-3.5" /> Shuffle
            </Link>
          )}
          <Link href={chapter.href} className="inline-flex items-center gap-1 whitespace-nowrap font-heading text-[13px] font-semibold text-primary hover:underline">
            {chapter.hrefLabel} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  )
}

/** "All 16 · Kyoto 7 · Tokyo 7 · Osaka 2" inside a country chapter. */
function CityChips({ items, city, onCity }: { items: LibraryItem[]; city: string | null; onCity: (c: string | null) => void }) {
  const cities = citiesOf(items)
  if (cities.length < 2) return null
  const chip = "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
  const on = "border-transparent bg-foreground text-background"
  return (
    <div className="-mx-4 mb-3.5 flex gap-1.5 overflow-x-auto px-4 pb-0.5 hide-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
      <button type="button" aria-pressed={city === null} onClick={() => onCity(null)} className={cn(chip, city === null ? on : "bg-background hover:bg-secondary")}>
        All {items.length}
      </button>
      {cities.map((c) => (
        <button
          key={c.city}
          type="button"
          aria-pressed={city === c.city}
          onClick={() => onCity(city === c.city ? null : c.city)}
          className={cn(chip, city === c.city ? on : "bg-background hover:bg-secondary")}
        >
          {c.city} <span className={cn(city === c.city ? "opacity-70" : "text-muted-foreground")}>{c.count}</span>
        </button>
      ))}
    </div>
  )
}

function MoreTile({ count, title, onClick, className }: { count: number; title: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-3 text-center text-[13px] font-medium text-muted-foreground outline-none transition hover:bg-secondary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground">
        <ChevronRight className="h-[18px] w-[18px]" />
      </span>
      {count} more{title ? ` in ${title}` : ""}
    </button>
  )
}

/**
 * How many rows a chapter shows: a peek that opens fully on "more", or — for
 * the single ungrouped chapter — a page at a time.
 */
function useLimit(base: number, paged: boolean, total: number): [number, () => void] {
  const [limit, setLimit] = React.useState(base)
  return [limit, () => setLimit((n) => (paged ? n + base : total))]
}

const DESKTOP_PEEK = 7
const MOBILE_PEEK = 5
/** "No grouping" is one grid; it renders a page at a time so 500 places stay light. */
const PAGE = 48

function GalleryChapter({ items, siblings, title, single, expanded, onExpand }: { items: LibraryItem[]; siblings: string[]; title: string; single: boolean; expanded: boolean; onExpand: () => void }) {
  const [pages, setPages] = React.useState(1)
  if (single) {
    const shown = items.slice(0, pages * PAGE)
    return (
      <>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 md:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => (
            <LibraryTile key={p.id} item={p} siblings={siblings} />
          ))}
        </div>
        {items.length > shown.length && (
          <div className="mt-6 flex justify-center">
            <button type="button" onClick={() => setPages((n) => n + 1)} className="rounded-full border px-5 py-2 text-sm font-medium hover:bg-secondary">
              Show {Math.min(PAGE, items.length - shown.length)} more of {items.length - shown.length}
            </button>
          </div>
        )}
      </>
    )
  }
  const desktopRest = items.length - DESKTOP_PEEK
  const mobileRest = items.length - MOBILE_PEEK
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 md:grid-cols-3 xl:grid-cols-4">
      {items.map((p, i) => {
        if (!expanded && i >= DESKTOP_PEEK) return null
        return (
          <div key={p.id} className={cn(!expanded && i >= MOBILE_PEEK && "hidden sm:block")}>
            <LibraryTile item={p} siblings={siblings} />
          </div>
        )
      })}
      {!expanded && mobileRest > 0 && <MoreTile count={mobileRest} title={title} onClick={onExpand} className="sm:hidden" />}
      {!expanded && desktopRest > 0 && <MoreTile count={desktopRest} title={title} onClick={onExpand} className="hidden sm:flex" />}
    </div>
  )
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

function Thumb({ p, className }: { p: LibraryItem; className?: string }) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-muted", className)}>
      {p.photos[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.photos[0].thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <FallbackArt name={p.name} kind={p.kind} />
      )}
    </div>
  )
}

/** A trip read as a diary: photo, serif name, your note as a quote, the day you went. */
function JournalChapter({ items, siblings, single }: { items: LibraryItem[]; siblings: string[]; single: boolean }) {
  const a = useLibraryActions()
  const [limit, more] = useLimit(single ? 24 : 6, single, items.length)
  const shown = items.slice(0, limit)
  return (
    <div className="max-w-[980px]">
      {shown.map((p) => {
        const checked = a.selected.has(p.id)
        return (
          <article key={p.id} className={cn("grid grid-cols-[96px_minmax(0,1fr)] gap-4 border-b py-4 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-5", checked && "bg-primary/5")}>
            <button
              type="button"
              onClick={() => a.activate(p.id, siblings)}
              aria-label={`${p.name}, ${locationOf(p)}`}
              className="group relative aspect-square overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:aspect-[4/3] sm:rounded-2xl"
            >
              <Thumb p={p} className="absolute inset-0 transition duration-700 group-hover:scale-[1.04]" />
            </button>
            <div className="min-w-0 sm:pt-1">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {flagFor(p.country) && <span className="mr-1">{flagFor(p.country)}</span>}
                  {locationOf(p) || "Somewhere"} · {kindLabel(p.kind)}
                </p>
                {a.selecting && <SelectMark checked={checked} label={`Select ${p.name}`} onToggle={() => a.toggleSelect(p.id)} tone="plain" />}
                <HeartButton id={p.id} name={p.name} className="h-7 w-7 bg-secondary text-foreground backdrop-blur-none hover:bg-secondary/80" />
                <LibraryPlaceMenu item={p} siblings={siblings} tone="plain" />
              </div>
              <h3>
                <button
                  type="button"
                  data-place-id={p.id}
                  onClick={() => a.activate(p.id, siblings)}
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
          </article>
        )
      })}
      {items.length > shown.length && (
        <button type="button" onClick={more} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {items.length - shown.length} more {items.length - shown.length === 1 ? "entry" : "entries"} <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/** The dense mode: one row per place, thumbnails kept, no table to squeeze onto a phone. */
function ListChapter({ items, siblings, collectionNames, single }: { items: LibraryItem[]; siblings: string[]; collectionNames: Map<string, string[]>; single: boolean }) {
  const a = useLibraryActions()
  const [limit, more] = useLimit(single ? 100 : 40, single, items.length)
  const shown = items.slice(0, limit)
  const cols = "md:grid-cols-[22px_44px_minmax(0,2fr)_minmax(0,1.2fr)_110px_92px_76px_minmax(0,1.3fr)_76px_28px]"
  return (
    <div role="table" aria-label="Places" className="text-[13px]">
      <div role="row" className={cn("hidden items-center gap-3 border-b px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid", cols)}>
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
      {shown.map((p) => {
        const checked = a.selected.has(p.id)
        const cols2 = collectionNames.get(p.id) ?? []
        return (
          <div
            role="row"
            key={p.id}
            className={cn(
              "grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border-b px-2 py-2 transition hover:bg-secondary/40",
              cols,
              checked && "bg-primary/5"
            )}
          >
            <span role="cell" className="hidden md:block">
              <SelectMark checked={checked} label={`Select ${p.name}`} onToggle={() => a.toggleSelect(p.id)} tone="plain" className="h-[18px] w-[18px]" />
            </span>
            <span role="cell" className="relative">
              <button type="button" onClick={() => a.activate(p.id, siblings)} aria-label={`Open ${p.name}`} className="block rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Thumb p={p} className="h-14 w-14 rounded-xl md:h-11 md:w-11 md:rounded-[10px]" />
              </button>
              {a.selecting && (
                <SelectMark checked={checked} label={`Select ${p.name}`} onToggle={() => a.toggleSelect(p.id)} className="absolute -left-1 -top-1 md:hidden" />
              )}
            </span>
            <span role="cell" className="min-w-0">
              <button type="button" data-place-id={p.id} onClick={() => a.activate(p.id, siblings)} className="block max-w-full truncate text-left font-semibold outline-none hover:underline focus-visible:underline">
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
            <span role="cell" className="hidden truncate text-muted-foreground md:block">{cols2.length ? cols2.join(", ") : "—"}</span>
            <span role="cell" className="hidden text-muted-foreground md:block">{monthYear(p.createdAt) ?? "—"}</span>
            <span role="cell" className="flex justify-end">
              <LibraryPlaceMenu item={p} siblings={siblings} tone="plain" />
            </span>
          </div>
        )
      })}
      {items.length > shown.length && (
        <button type="button" onClick={more} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Show {items.length - shown.length} more <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function ChapterSection({
  chapter,
  group,
  view,
  siblings,
  collectionNames,
}: {
  chapter: Chapter
  group: GroupMode
  view: LibraryView
  siblings: string[]
  collectionNames: Map<string, string[]>
}) {
  const [city, setCity] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState(false)
  const items = city ? chapter.items.filter((p) => p.city?.trim() === city) : chapter.items
  const single = chapter.key === "all"

  return (
    <section id={`chapter-${chapter.key}`} data-chapter={chapter.key} className="mb-10 scroll-mt-20 sm:mb-12" aria-label={single ? "Your places" : chapter.title}>
      {!single && <ChapterHeader chapter={chapter} group={group} items={chapter.items} collage={group === "collection" && view === "journal"} />}
      {group === "country" && view !== "list" && <CityChips items={chapter.items} city={city} onCity={setCity} />}
      {view === "journal" ? (
        <JournalChapter items={items} siblings={siblings} single={single} />
      ) : view === "list" ? (
        <ListChapter items={items} siblings={siblings} collectionNames={collectionNames} single={single} />
      ) : (
        <GalleryChapter items={items} siblings={siblings} title={chapter.title} single={single} expanded={expanded} onExpand={() => setExpanded(true)} />
      )}
    </section>
  )
}

function useScrollSpy(keys: string[]): string | null {
  const [active, setActive] = React.useState<string | null>(keys[0] ?? null)
  React.useEffect(() => {
    if (!keys.length) return
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set((e.target as HTMLElement).dataset.chapter!, e.isIntersecting)
        const first = keys.find((k) => seen.get(k))
        if (first) setActive(first)
      },
      { rootMargin: "-90px 0px -55% 0px" }
    )
    for (const k of keys) {
      const el = document.querySelector<HTMLElement>(`[data-chapter="${CSS.escape(k)}"]`)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [keys])
  return active
}

function jumpTo(key: string) {
  document.getElementById(`chapter-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

function IndexLink({ chapter, active, onJump, size = "rail" }: { chapter: Chapter; active: boolean; onJump: (k: string) => void; size?: "rail" | "sheet" }) {
  return (
    <button
      type="button"
      onClick={() => onJump(chapter.key)}
      aria-current={active ? "location" : undefined}
      className={cn(
        "flex w-full min-w-0 items-baseline gap-2 text-left font-editorial leading-[1.25] outline-none transition hover:text-foreground focus-visible:text-foreground focus-visible:underline",
        size === "rail" ? "text-[22px]" : "break-inside-avoid text-[21px]",
        active ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {chapter.flag && <span className="font-sans text-[15px]" aria-hidden>{chapter.flag}</span>}
      <span className="min-w-0 truncate">{chapter.title}</span>
      <small className="shrink-0 font-sans text-[11px] font-medium opacity-70">{chapter.items.length}</small>
    </button>
  )
}

const GROUP_NOUN: Record<GroupMode, [string, string]> = {
  country: ["country", "countries"], city: ["city", "cities"], collection: ["chapter", "chapters"], shelf: ["shelf", "shelves"],
  kind: ["kind", "kinds"], month: ["month", "months"], saved: ["month", "months"], none: ["chapter", "chapters"],
}

/** The serif index where the filter wall used to be: jump to a chapter, see where you are. */
function IndexRail({ chapters, group, active }: { chapters: Chapter[]; group: GroupMode; active: string | null }) {
  const { selecting } = useLibraryActions()
  const [all, setAll] = React.useState(false)
  const LIMIT = 14
  const shown = all ? chapters : chapters.slice(0, LIMIT)
  const [one, many] = GROUP_NOUN[group]
  return (
    // While selecting, the selection toolbar makes the sticky bar taller.
    <nav
      aria-label="Index"
      className={cn(
        "sticky hidden max-h-[calc(100vh-150px)] overflow-y-auto pb-6 hide-scrollbar lg:block",
        selecting ? "top-[104px]" : "top-[56px]"
      )}
    >
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
        Index · {chapters.length} {chapters.length === 1 ? one : many}
      </p>
      {shown.map((c) => (
        <IndexLink key={c.key} chapter={c} active={active === c.key} onJump={jumpTo} />
      ))}
      {chapters.length > LIMIT && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1.5 text-[15px] text-muted-foreground hover:text-foreground">
          {all ? "Show fewer" : `+ ${chapters.length - LIMIT} more`}
        </button>
      )}
    </nav>
  )
}

/** Phones: a floating "Index" pill that opens the chapters as a two-column sheet. */
function MobileIndex({ chapters, group, active }: { chapters: Chapter[]; group: GroupMode; active: string | null }) {
  const [open, setOpen] = React.useState(false)
  const [, many] = GROUP_NOUN[group]
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="fixed bottom-5 right-4 z-30 inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background shadow-[0_8px_24px_rgba(0,0,0,.3)] outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Globe2 className="h-4 w-4" /> Index
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            editorialFont.variable,
            "fixed inset-x-0 bottom-0 z-[60] max-h-[75dvh] overflow-y-auto rounded-t-3xl bg-background px-5 pb-8 text-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8"
          )}
        >
          <div className="mx-auto my-2 h-[5px] w-10 rounded-full bg-border" aria-hidden />
          <div className="mb-2.5 mt-1.5 flex items-center">
            <Dialog.Title className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Jump to a chapter</Dialog.Title>
            <span className="ml-auto text-xs text-muted-foreground">
              {chapters.length} {many}
            </span>
          </div>
          <Dialog.Description className="sr-only">Pick a chapter to scroll to it.</Dialog.Description>
          <div className="columns-2 gap-4">
            {chapters.map((c) => (
              <IndexLink
                key={c.key}
                chapter={c}
                active={active === c.key}
                size="sheet"
                onJump={(k) => {
                  setOpen(false)
                  // Let the sheet close (and release the scroll lock) before scrolling.
                  window.setTimeout(() => jumpTo(k), 180)
                }}
              />
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Gallery, Journal and Compact list: the chapters, with the index beside them. */
export function LibraryChapters({
  chapters,
  group,
  view,
  siblings,
  collectionNames,
  interlude,
}: {
  chapters: Chapter[]
  group: GroupMode
  view: LibraryView
  siblings: string[]
  collectionNames: Map<string, string[]>
  /** Phones only: shown after the first chapter, so the first places come right under the tools. */
  interlude?: React.ReactNode
}) {
  const keys = React.useMemo(() => chapters.map((c) => c.key), [chapters])
  const active = useScrollSpy(keys)
  const indexed = group !== "none" && chapters.length > 1

  return (
    <div className={cn("px-4 py-6 sm:px-8", indexed && "lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-7")}>
      {indexed && <IndexRail chapters={chapters} group={group} active={active} />}
      <div className="min-w-0">
        {chapters.map((c, i) => (
          <React.Fragment key={`${group}:${view}:${c.key}`}>
            <ChapterSection chapter={c} group={group} view={view} siblings={siblings} collectionNames={collectionNames} />
            {i === 0 && interlude && <div className="mb-10 sm:hidden">{interlude}</div>}
          </React.Fragment>
        ))}
      </div>
      {indexed && <MobileIndex chapters={chapters} group={group} active={active} />}
    </div>
  )
}
