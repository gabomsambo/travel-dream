"use client"

// The gallery as one virtualized list of rows (chapter headers, rows of tiles, the
// phone interlude), windowed against the (app) shell's <main>: that, not the window,
// is what scrolls. Only the rows near the screen are mounted, so the DOM, the
// decoded images and every re-render stay the size of a screen at any library size.

import * as React from "react"
import { observeElementRect, useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import type { Chapter } from "@/lib/library/chapters"
import {
  MOBILE_PEEK,
  DESKTOP_PEEK,
  buildGalleryRows,
  chapterRowIndex,
  rowChapterKey,
  type GalleryRow,
} from "@/lib/library/gallery-rows"
import { forgetScroll, recallScroll, rememberScroll, takeArrivalByHistory } from "@/lib/library/scroll-memory"
import type { GroupMode } from "@/lib/library/types"
import { CityChips, MoreTile } from "./library-chapter-parts"
import { LibraryTile } from "./library-tile"

/** `scroll-mt-20`: a chapter lands clear of the sticky tools after a jump. */
const STICKY_OFFSET = 80
/** The chapter you are "in" is the one under this line, just below the sticky tools. */
const SPY_LINE = STICKY_OFFSET + 10
const OVERSCAN_ROWS = 4
/** What the server renders and what an unmeasured scroll box falls back to: one tall screen. */
const FIRST_SCREEN = { width: 1100, height: 1000 }

// A scroll box that measures empty (before layout, or under a test) shows the first screen, not nothing.
const observeScrollRect: typeof observeElementRect = (instance, cb) =>
  observeElementRect(instance, (rect) => cb(rect.height > 0 ? rect : FIRST_SCREEN))

const BREAKPOINTS = ["(min-width: 1280px)", "(min-width: 768px)", "(min-width: 640px)"]

function subscribeLayout(cb: () => void) {
  const queries = BREAKPOINTS.map((q) => window.matchMedia(q))
  queries.forEach((q) => q.addEventListener("change", cb))
  return () => queries.forEach((q) => q.removeEventListener("change", cb))
}

/** The grid's columns and the peek, on the same breakpoints as its CSS (xl:4, md:3, else 2; phones peek 5). */
function useGalleryLayout(): { cols: number; peek: number } {
  const key = React.useSyncExternalStore(
    subscribeLayout,
    () => (window.matchMedia(BREAKPOINTS[0]).matches ? "4" : window.matchMedia(BREAKPOINTS[1]).matches ? "3" : window.matchMedia(BREAKPOINTS[2]).matches ? "2" : "phone"),
    () => "4"
  )
  return { cols: key === "4" ? 4 : key === "3" ? 3 : 2, peek: key === "phone" ? MOBILE_PEEK : DESKTOP_PEEK }
}

export interface VirtualGalleryHandle {
  jumpTo: (chapterKey: string) => void
}

export function VirtualGallery({
  chapters,
  group,
  siblings,
  interlude,
  header,
  onActive,
  handle,
}: {
  chapters: Chapter[]
  group: GroupMode
  siblings: string[]
  /** Phones only: shown after the first chapter, so the first places come right under the tools. */
  interlude?: React.ReactNode
  header: (chapter: Chapter, cityChips: React.ReactNode) => React.ReactNode
  /** The chapter under the sticky tools, for the index. */
  onActive: (chapterKey: string | null) => void
  handle: React.MutableRefObject<VirtualGalleryHandle | null>
}) {
  const { cols, peek } = useGalleryLayout()
  const phone = peek === MOBILE_PEEK
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set())
  const [cityBy, setCityBy] = React.useState<ReadonlyMap<string, string | null>>(() => new Map())
  const [pages, setPages] = React.useState(1)
  const hasInterlude = !!interlude

  const rows = React.useMemo(
    () => buildGalleryRows(chapters, { group, cols, peek, expanded, cityBy, pages, interlude: hasInterlude }),
    [chapters, group, cols, peek, expanded, cityBy, pages, hasInterlude]
  )
  const rowsRef = React.useRef(rows)
  rowsRef.current = rows

  // ---- the scroll box and where the list starts inside it ---------------------
  const listRef = React.useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = React.useState<HTMLElement | null>(null)
  const [margin, setMargin] = React.useState(0)
  const [width, setWidth] = React.useState(FIRST_SCREEN.width)
  React.useLayoutEffect(() => {
    const list = listRef.current
    const main = list?.closest("main") ?? null
    setScrollEl(main)
    if (!list || !main) return
    const measure = () => {
      setMargin(Math.round(list.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop))
      setWidth(list.clientWidth || FIRST_SCREEN.width)
    }
    measure()
    // The cover, filter chips and trips shelf above the list change its offset; the page wrapper holds them all.
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    if (main.firstElementChild) observer.observe(main.firstElementChild)
    return () => observer.disconnect()
  }, [])

  const gap = phone ? 10 : 14
  const tileHeight = ((width - (cols - 1) * gap) / cols) * (4 / 3)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: (i) => {
      // Close to what the rows measure at 5,000 places, so the scrollbar barely moves as rows get measured.
      const row = rows[i]
      if (row.kind === "header") {
        if (group === "country") return phone ? 118 : 204
        return (row.chapter.eyebrow ? 21 : 0) + (phone ? 74 : 92)
      }
      if (row.kind === "interlude") return phone ? 360 : 0
      if (row.kind === "pager") return 96
      return tileHeight + (row.last ? (phone ? 40 : 48) : gap)
    },
    overscan: OVERSCAN_ROWS,
    scrollMargin: margin,
    scrollPaddingStart: STICKY_OFFSET,
    getItemKey: (i) => rows[i].key,
    initialRect: FIRST_SCREEN,
    observeElementRect: observeScrollRect,
    measureElement: (node, entry, instance) => {
      const row = node as HTMLElement
      const size = Math.round(entry?.borderBoxSize?.[0]?.blockSize ?? row.offsetHeight)
      // Nothing laid out (display: none on a larger screen, or no layout engine) keeps the estimate, not a row of 0.
      return size === 0 && row.getClientRects().length === 0 ? instance.options.estimateSize(Number(row.dataset.index)) : size
    },
  })

  // Rows keep their measured heights across a re-layout only when nothing about the layout changed.
  React.useLayoutEffect(() => {
    virtualizer.measure()
    listRef.current?.querySelectorAll<HTMLElement>("[data-index]").forEach((node) => virtualizer.measureElement(node))
  }, [virtualizer, cols, peek, width])

  // ---- the index: jump, and which chapter you are in --------------------------
  handle.current = {
    jumpTo: (chapterKey) => {
      const index = chapterRowIndex(rowsRef.current).get(chapterKey)
      if (index !== undefined) virtualizer.scrollToIndex(index, { align: "start" })
    },
  }

  const lastActive = React.useRef<string | null | undefined>(undefined)
  const rowAtLine = React.useCallback(
    (line: number) => {
      const items = virtualizer.getVirtualItems()
      return items.find((item) => item.end > line) ?? items[items.length - 1]
    },
    [virtualizer]
  )
  const reportActive = React.useCallback(() => {
    if (!scrollEl) return
    const hit = rowAtLine(scrollEl.scrollTop + SPY_LINE)
    // A row with no chapter (the interlude) belongs to the chapter above it.
    let key: string | null = null
    for (let i = hit?.index ?? -1; i >= 0 && key === null; i--) key = rowChapterKey(rowsRef.current[i])
    key ??= rowChapterKey(rowsRef.current[0])
    if (key === lastActive.current) return
    lastActive.current = key
    onActive(key)
  }, [scrollEl, rowAtLine, onActive])
  // After every render: filtering or expanding changes which chapter sits under the line without a scroll.
  React.useEffect(reportActive)

  // ---- scroll memory: Back from a place page lands where you were -------------
  const url = () => window.location.pathname + window.location.search
  React.useEffect(() => {
    if (!scrollEl) return
    let frame = 0
    let timer: number | undefined
    // Captured at scroll time so cleanup can flush after the list (and its rects) are gone,
    // and under the Library URL even if App Router has already pushed /place/... .
    let pending:
      | { url: string; remember: { rowKey: string; top: number } }
      | { url: string; forget: true }
      | null = null
    const capture = () => {
      const pageUrl = url()
      const hit = rowAtLine(scrollEl.scrollTop)
      // Above the list (the cover, the shelves) there is nothing to come back to but the top.
      const listTop = listRef.current?.getBoundingClientRect().top ?? 0
      if (!hit || listTop > scrollEl.getBoundingClientRect().top) pending = { url: pageUrl, forget: true }
      else pending = { url: pageUrl, remember: { rowKey: rowsRef.current[hit.index]?.key ?? "", top: scrollEl.scrollTop } }
    }
    const flush = () => {
      if (!pending) return
      const decision = pending
      pending = null
      if ("forget" in decision) forgetScroll(decision.url)
      else rememberScroll(decision.url, decision.remember)
    }
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          reportActive()
        })
      }
      capture()
      window.clearTimeout(timer)
      timer = window.setTimeout(flush, 150)
    }
    scrollEl.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      scrollEl.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
      flush()
      window.clearTimeout(timer)
    }
  }, [scrollEl, reportActive, rowAtLine])

  const restored = React.useRef(false)
  React.useEffect(() => {
    if (!scrollEl || restored.current) return
    restored.current = true
    if (!takeArrivalByHistory()) {
      // A fresh visit starts at the top; forget the position a later Back would otherwise revive.
      forgetScroll(url())
      return
    }
    const memory = recallScroll(url())
    if (!memory) return
    const index = rowsRef.current.findIndex((r) => r.key === memory.rowKey)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "start" })
    else scrollEl.scrollTop = memory.top
  }, [scrollEl, virtualizer])

  const expand = React.useCallback((key: string) => setExpanded((s) => new Set(s).add(key)), [])
  const setCity = React.useCallback((key: string, city: string | null) => setCityBy((m) => new Map(m).set(key, city)), [])
  const morePages = React.useCallback(() => setPages((n) => n + 1), [])

  const items = virtualizer.getVirtualItems()
  return (
    <div ref={listRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      <div className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${(items[0]?.start ?? 0) - margin}px)` }}>
        {items.map((item) => (
          // flow-root: a header's bottom margin stays inside the row, where it is measured.
          <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} className="flow-root">
            <RowView
              row={rows[item.index]}
              siblings={siblings}
              header={header}
              showCities={group === "country"}
              onCity={setCity}
              onExpand={expand}
              onMorePages={morePages}
              interlude={interlude}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

const RowView = React.memo(function RowView({
  row,
  siblings,
  header,
  showCities,
  onCity,
  onExpand,
  onMorePages,
  interlude,
}: {
  row: GalleryRow
  siblings: string[]
  header: (chapter: Chapter, cityChips: React.ReactNode) => React.ReactNode
  showCities: boolean
  onCity: (chapterKey: string, city: string | null) => void
  onExpand: (chapterKey: string) => void
  onMorePages: () => void
  interlude?: React.ReactNode
}) {
  if (row.kind === "interlude") return <div className="mb-10 sm:hidden">{interlude}</div>
  if (row.kind === "pager") {
    return (
      <div className="flex justify-center pb-10 pt-3 sm:pb-12">
        <button type="button" onClick={onMorePages} className="rounded-full border px-5 py-2 text-sm font-medium hover:bg-secondary">
          Show {row.next} more of {row.remaining}
        </button>
      </div>
    )
  }
  const { chapter } = row
  if (row.kind === "header") {
    const chips = showCities ? <CityChips items={chapter.items} city={row.city} onCity={(c) => onCity(chapter.key, c)} /> : null
    return (
      <div id={`chapter-${chapter.key}`} data-chapter={chapter.key}>
        {header(chapter, chips)}
      </div>
    )
  }
  const single = chapter.key === "all"
  return (
    <div
      role="list"
      aria-label={single ? "Your places" : chapter.title}
      className={cn("grid grid-cols-2 gap-2.5 pb-2.5 sm:gap-3.5 sm:pb-3.5 md:grid-cols-3 xl:grid-cols-4", row.last && "pb-10 sm:pb-12")}
    >
      {row.cells.map((cell, i) => (
        <div key={cell.kind === "tile" ? cell.item.id : "more"} role="listitem" aria-setsize={row.setSize} aria-posinset={row.firstPos + i}>
          {cell.kind === "tile" ? (
            <LibraryTile item={cell.item} siblings={siblings} />
          ) : (
            <MoreTile count={cell.count} title={single ? "" : chapter.title} onClick={() => onExpand(chapter.key)} />
          )}
        </div>
      ))}
    </div>
  )
})
