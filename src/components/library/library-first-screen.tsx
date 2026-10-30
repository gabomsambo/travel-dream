"use client"

import * as React from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { useExplore } from "@/components/explore/explore-provider"
import { firstScreenItems, type FirstScreenChapter, type IndexedSeed } from "@/lib/library/first-screen"
import { DESKTOP_PEEK, MOBILE_PEEK } from "@/lib/library/gallery-rows"
import { LibraryActionsProvider, type LibraryActions } from "./library-actions"
import { ChapterHeader } from "./library-chapters"
import { CityChipsList, MoreTile } from "./library-chapter-parts"
import { LibraryCover } from "./library-cover"
import { LibraryShelves } from "./library-shelves"
import { LibraryTile } from "./library-tile"

const noop = () => undefined
const NONE: ReadonlySet<string> = new Set()

/**
 * The Library's first screen, painted from what the server sent while the index
 * (every other place) is on its way. It is the page's own cover, shelves,
 * chapter headers and tiles, with the controls that need the whole library
 * (search, filters, sort, view, select) shown as the empty frames they will
 * fill. A tile opens quick look at once; the index replaces this screen without
 * closing it.
 */
export function LibraryFirstScreen({ seed, error, onRetry }: { seed: IndexedSeed; error: boolean; onRetry: () => void }) {
  const { openPlace } = useExplore()
  const siblings = React.useMemo(() => firstScreenItems(seed).map((p) => p.id), [seed])
  const actions = React.useMemo<LibraryActions>(
    () => ({
      hearts: new Set(seed.heartIds),
      toggleHeart: noop,
      selected: NONE,
      selecting: false,
      toggleSelect: noop,
      select: noop,
      activate: (id, ids) => openPlace(id, ids),
      openPlace,
      archive: noop,
      remove: noop,
      addToCollection: noop,
      findImage: noop,
    }),
    [seed.heartIds, openPlace]
  )

  return (
    <LibraryActionsProvider value={actions}>
      <LibraryCover photos={seed.cover} stats={seed.stats} onShelf={noop} onGroup={noop} />

      <div className="relative z-30 -mt-[26px] px-4 sm:-mt-[34px] sm:px-8" aria-hidden>
        <div className="flex h-[50px] items-center gap-3 rounded-full border bg-card px-5 text-muted-foreground shadow-sm sm:h-[60px]">
          <Search className="h-4 w-4 shrink-0" />
          <span className="font-editorial text-[22px] sm:text-[26px]">Search your atlas…</span>
        </div>
      </div>

      <div className="space-y-3 px-4 pt-4 sm:px-8 sm:pt-[22px]">
        <LibraryShelves active={seed.shelf} counts={seed.shelfCounts} onShelf={noop} />
        {/* Heights are the real rows' (smart shelves, trips, view bar), so the chapters do not move when the page takes over. */}
        <div className="flex h-9 gap-2 overflow-hidden sm:h-[72px] sm:flex-wrap" aria-hidden>
          {["w-28", "w-32", "w-28", "w-24"].map((w, i) => (
            <div key={i} className={cn("h-9 shrink-0 animate-pulse rounded-full bg-muted", w)} />
          ))}
        </div>
      </div>

      {seed.showTrips && <div className="hidden h-[279px] px-8 pt-7 sm:block" aria-hidden />}

      <div className="mt-5 sm:mt-6" aria-busy={!error}>
        <p className="sr-only" role="status">
          {error ? "Couldn't load the rest of your library." : `Loading the rest of your ${seed.total} places`}
        </p>
        <div className="flex h-[51px] items-center px-4 sm:h-[61px] sm:px-8" aria-hidden>
          <div className="h-8 w-48 animate-pulse rounded-full bg-muted" />
        </div>
        {error && (
          <p className="px-4 pt-3 text-sm text-muted-foreground sm:px-8">
            Couldn&apos;t load the rest of your library.{" "}
            <button type="button" onClick={onRetry} className="font-medium text-foreground underline underline-offset-4">
              Try again
            </button>
          </p>
        )}
        {seed.view === "grid" ? <FirstChapters seed={seed} siblings={siblings} /> : <BodyFrame />}
      </div>
    </LibraryActionsProvider>
  )
}

function BodyFrame() {
  return (
    <div className="px-4 pt-6 sm:px-8" aria-hidden>
      <div className="mb-4 h-12 w-56 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  )
}

/** The gallery's top: the same chapter headers and peeks the virtual gallery draws, for the first few chapters. */
function FirstChapters({ seed, siblings }: { seed: IndexedSeed; siblings: string[] }) {
  const indexed = seed.group !== "none" && seed.chapterCount > 1
  return (
    <div className={cn("px-4 py-6 sm:px-8", indexed && "lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-7")}>
      {indexed && <div className="hidden lg:block" aria-hidden />}
      <div className="min-w-0">
        {seed.chapters.map((chapter) => (
          <FirstChapter key={chapter.key} chapter={chapter} group={seed.group} siblings={siblings} />
        ))}
      </div>
    </div>
  )
}

function FirstChapter({ chapter, group, siblings }: { chapter: FirstScreenChapter; group: IndexedSeed["group"]; siblings: string[] }) {
  const single = chapter.key === "all"
  return (
    <section>
      {!single && (
        <div data-chapter={chapter.key}>
          <ChapterHeader chapter={chapter} group={group} items={chapter.items} summary={chapter.summary} />
          {group === "country" && <CityChipsList cities={chapter.cities} total={chapter.count} city={null} onCity={noop} />}
        </div>
      )}
      <div
        role="list"
        aria-label={single ? "Your places" : chapter.title}
        className="grid grid-cols-2 gap-2.5 pb-10 sm:gap-3.5 sm:pb-12 md:grid-cols-3 xl:grid-cols-4"
      >
        {chapter.items.map((item, i) => (
          // A phone peeks five; the rest are the desktop's, hidden by CSS because the server cannot know the screen.
          <div key={item.id} role="listitem" className={cn(!single && i >= MOBILE_PEEK && "hidden sm:block")}>
            <LibraryTile item={item} siblings={siblings} />
          </div>
        ))}
        {!single && chapter.count > MOBILE_PEEK && (
          <div role="listitem" className="sm:hidden">
            <MoreTile count={chapter.count - MOBILE_PEEK} title={chapter.title} onClick={noop} />
          </div>
        )}
        {!single && chapter.count > DESKTOP_PEEK && (
          <div role="listitem" className="hidden sm:block">
            <MoreTile count={chapter.count - DESKTOP_PEEK} title={chapter.title} onClick={noop} />
          </div>
        )}
      </div>
    </section>
  )
}
