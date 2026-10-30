"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Globe2, Shuffle } from "lucide-react"
import { cn } from "@/lib/utils"
import * as Dialog from "@radix-ui/react-dialog"
import { Photo } from "@/components/photo"
import { editorialFont } from "@/components/explore/fonts"
import { chapterSummary, type Chapter } from "@/lib/library/chapters"
import type { GroupMode, LibraryItem, LibraryView } from "@/lib/library/types"
import { useIsSelecting } from "./library-actions"
import { VirtualEntries } from "./library-entries"
import { VirtualGallery } from "./library-virtual-gallery"
import type { VirtualRowsHandle } from "./virtual-rows"

const MemoVirtualGallery = React.memo(VirtualGallery)
const MemoVirtualEntries = React.memo(VirtualEntries)

/** Header of one chapter: flag, serif name, the counts, and where it continues. */
export function ChapterHeader({
  chapter,
  group,
  items,
  collage,
  summary,
}: {
  chapter: Omit<Chapter, "items">
  group: GroupMode
  items: LibraryItem[]
  collage?: boolean
  /** The summary line when `items` is only the chapter's first few (the server's first screen). */
  summary?: string
}) {
  const photos = collage ? items.filter((p) => p.photos.length).slice(0, 3).map((p) => p.photos[0].thumb) : []
  const isCountry = group === "country" && chapter.key !== "country:none"
  return (
    <div className="mb-3.5 flex flex-wrap items-end gap-x-4 gap-y-2">
      {collage && photos.length > 0 ? (
        <div className="grid aspect-[4/3] w-24 shrink-0 grid-cols-[2fr_1fr] grid-rows-2 gap-[2px] overflow-hidden rounded-xl bg-muted sm:w-[120px]">
          {photos.map((src, i) => (
            <div key={src + i} className={cn("relative", i === 0 && "row-span-2")}>
              <Photo src={src} use="thumb" sizes={i === 0 ? "80px" : "40px"} />
            </div>
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
        <p className="mt-2 text-[12px] text-muted-foreground sm:text-[13px]">{summary ?? chapterSummary(items, group !== "city")}</p>
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
function IndexRail({ chapters, group, active, onJump }: { chapters: Chapter[]; group: GroupMode; active: string | null; onJump: (key: string) => void }) {
  const [all, setAll] = React.useState(false)
  const LIMIT = 14
  const shown = all ? chapters : chapters.slice(0, LIMIT)
  const [one, many] = GROUP_NOUN[group]
  return (
    // Sits under the sticky tools, whose height (one row, or two with filter chips) they publish.
    <nav aria-label="Index" className="sticky top-[calc(var(--library-bar-h,46px)+10px)] hidden max-h-[calc(100vh-150px)] overflow-y-auto pb-6 hide-scrollbar lg:block">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
        Index · {chapters.length} {chapters.length === 1 ? one : many}
      </p>
      {shown.map((c) => (
        <IndexLink key={c.key} chapter={c} active={active === c.key} onJump={onJump} />
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
function MobileIndex({ chapters, group, active, onJump }: { chapters: Chapter[]; group: GroupMode; active: string | null; onJump: (key: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const selecting = useIsSelecting()
  // The bulk bar owns the bottom of the screen while selecting.
  if (selecting) return null
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
                  window.setTimeout(() => onJump(k), 180)
                }}
              />
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * Gallery, Journal and Compact list: the chapters, with the index beside them.
 * Memoized: typing in the search re-renders the page above it every keystroke,
 * and the chapters only need to follow when their own props change.
 */
export const LibraryChapters = React.memo(function LibraryChapters({
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
  const [active, setActive] = React.useState<string | null>(null)
  const handle = React.useRef<VirtualRowsHandle | null>(null)
  const jump = React.useCallback((key: string) => handle.current?.jumpTo(key), [])
  const renderHeader = React.useCallback(
    (c: Chapter, chips: React.ReactNode) => (
      <>
        <ChapterHeader chapter={c} group={group} items={c.items} collage={group === "collection" && view === "journal"} />
        {chips}
      </>
    ),
    [group, view]
  )
  const indexed = group !== "none" && chapters.length > 1

  return (
    <div className={cn("px-4 py-6 sm:px-8", indexed && "lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-7")}>
      {indexed && <IndexRail chapters={chapters} group={group} active={active} onJump={jump} />}
      <div className="min-w-0">
        {view === "grid" ? (
          <MemoVirtualGallery key={group} chapters={chapters} group={group} siblings={siblings} interlude={interlude} header={renderHeader} onActive={setActive} handle={handle} />
        ) : (
          <MemoVirtualEntries
            key={`${group}:${view}`}
            chapters={chapters}
            group={group}
            view={view}
            siblings={siblings}
            collectionNames={collectionNames}
            interlude={interlude}
            header={renderHeader}
            onActive={setActive}
            handle={handle}
          />
        )}
      </div>
      {indexed && <MobileIndex chapters={chapters} group={group} active={active} onJump={jump} />}
    </div>
  )
})
