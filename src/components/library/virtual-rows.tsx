"use client"

// The row engine under every windowed Library list (gallery, journal, compact list, the
// map's side list): a flat list of keyed rows, windowed against whatever scrolls. For the
// (app) shell that is <main>, not the window. Only the rows near the screen are mounted, so
// the DOM, the decoded images and every re-render stay the size of a screen at any library size.

import * as React from "react"
import { observeElementRect, useVirtualizer } from "@tanstack/react-virtual"
import { chapterRowIndex } from "@/lib/library/gallery-rows"
import { forgetScroll, recallScroll, rememberScroll, takeArrivalByHistory } from "@/lib/library/scroll-memory"

/** `scroll-mt-20`: a chapter lands clear of the sticky tools after a jump. */
const STICKY_OFFSET = 80
/** The chapter you are "in" is the one under this line, just below the sticky tools. */
const SPY_LINE = STICKY_OFFSET + 10
const OVERSCAN_ROWS = 4
/** What the server renders and what an unmeasured scroll box falls back to: one tall screen. */
export const FIRST_SCREEN = { width: 1100, height: 1000 }

// A scroll box that measures empty (before layout, or under a test) shows the first screen, not nothing.
const observeScrollRect: typeof observeElementRect = (instance, cb) =>
  observeElementRect(instance, (rect) => cb(rect.height > 0 ? rect : FIRST_SCREEN))

/** The app shell's scroll container: what every list but the map's side list windows against. */
export const mainOf = (list: HTMLElement): HTMLElement | null => list.closest("main")

/**
 * The box that clips on-screen places for j/k: the map's side list from lg (it scrolls
 * itself), otherwise <main>. Overscan rows outside this rect must not be treated as visible.
 */
export function placesViewport(): HTMLElement | null {
  const side = document.querySelector<HTMLElement>("[data-side-list]")
  if (side && window.matchMedia("(min-width: 1024px)").matches) return side
  return document.querySelector("main")
}

export interface VirtualRowsHandle {
  jumpTo: (chapterKey: string) => void
}

/** A media query that follows the screen; `server` is what the first render (and the server) assumes. */
export function useMediaQuery(query: string, server: boolean): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      const q = window.matchMedia(query)
      q.addEventListener("change", cb)
      return () => q.removeEventListener("change", cb)
    },
    () => window.matchMedia(query).matches,
    () => server
  )
}

export function VirtualRows<R extends { key: string }>({
  rows,
  estimate,
  render,
  layoutKey,
  chapterOf,
  onActive,
  handle,
  remember = true,
  scrollParent = mainOf,
  listProps,
  rowRole,
}: {
  rows: R[]
  /** What a row will measure, close enough that the scrollbar barely moves as rows get measured. */
  estimate: (row: R, width: number) => number
  render: (row: R, index: number) => React.ReactNode
  /** Changes when the layout does (columns, breakpoint), so measured heights are taken again. */
  layoutKey: string
  /** The chapter a row belongs to; with it, the index can jump and `onActive` hears where you are. */
  chapterOf?: (row: R) => string | null
  /** The chapter under the sticky tools, for the index. */
  onActive?: (chapterKey: string | null) => void
  handle?: React.MutableRefObject<VirtualRowsHandle | null>
  /** Back from a place page lands where you were. */
  remember?: boolean
  /** The box that scrolls the list. Must be a stable function. */
  scrollParent?: (list: HTMLElement) => HTMLElement | null
  /** ARIA for the list as a whole, e.g. a table's role and its row count. */
  listProps?: React.HTMLAttributes<HTMLDivElement>
  /** Role of the wrapper around each row (a table's rows are not the wrappers). */
  rowRole?: string
}) {
  const rowsRef = React.useRef(rows)
  rowsRef.current = rows

  // ---- the scroll box and where the list starts inside it ---------------------
  const listRef = React.useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = React.useState<HTMLElement | null>(null)
  const [margin, setMargin] = React.useState(0)
  const [width, setWidth] = React.useState(FIRST_SCREEN.width)
  React.useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    let scroller: HTMLElement | null = null
    // The cover, filter chips and trips shelf above the list change its offset; the scroll box's content holds them all.
    const observer = new ResizeObserver(() => measure())
    const measure = () => {
      const next = scrollParent(list)
      if (next !== scroller) {
        if (scroller?.firstElementChild) observer.unobserve(scroller.firstElementChild)
        scroller = next
        setScrollEl(next)
        if (next?.firstElementChild) observer.observe(next.firstElementChild)
      }
      if (!scroller) return
      setMargin(Math.round(list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop))
      setWidth(list.clientWidth || FIRST_SCREEN.width)
    }
    observer.observe(list)
    measure()
    return () => observer.disconnect()
  }, [scrollParent])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: (i) => estimate(rows[i], width),
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
  }, [virtualizer, layoutKey, width])

  // ---- the index: jump, and which chapter you are in --------------------------
  if (handle) {
    handle.current = {
      jumpTo: (chapterKey) => {
        if (!chapterOf) return
        const index = chapterRowIndex(rowsRef.current, chapterOf).get(chapterKey)
        if (index !== undefined) virtualizer.scrollToIndex(index, { align: "start" })
      },
    }
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
    if (!scrollEl || !onActive || !chapterOf) return
    const hit = rowAtLine(scrollEl.scrollTop + SPY_LINE)
    // A row with no chapter (the interlude) belongs to the chapter above it.
    let key: string | null = null
    for (let i = hit?.index ?? -1; i >= 0 && key === null; i--) key = chapterOf(rowsRef.current[i])
    key ??= chapterOf(rowsRef.current[0])
    if (key === lastActive.current) return
    lastActive.current = key
    onActive(key)
  }, [scrollEl, rowAtLine, onActive, chapterOf])
  // After every render: filtering or expanding changes which chapter sits under the line without a scroll.
  React.useEffect(reportActive)

  // ---- scroll memory: Back from a place page lands where you were -------------
  const url = () => window.location.pathname + window.location.search
  React.useEffect(() => {
    if (!scrollEl || !remember) return
    const mountPath = window.location.pathname
    let frame = 0
    let timer: number | undefined
    // Captured at scroll time so cleanup can flush after the list (and its rects) are gone,
    // and under the Library URL even if App Router has already pushed /place/... .
    let pending:
      | { url: string; remember: { rowKey: string; top: number } }
      | { url: string; forget: true }
      | null = null
    const capture = () => {
      // Shared <main> can fire a clamp scroll after pushState to /place/... while this
      // listener is still attached; ignore it so the last Library pending is what flush writes.
      if (window.location.pathname !== mountPath) return
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
  }, [scrollEl, remember, reportActive, rowAtLine])

  const restored = React.useRef(false)
  React.useEffect(() => {
    if (!scrollEl || !remember || restored.current) return
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
  }, [scrollEl, remember, virtualizer])

  const items = virtualizer.getVirtualItems()
  return (
    <div {...listProps} ref={listRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      <div className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${(items[0]?.start ?? 0) - margin}px)` }}>
        {items.map((item) => (
          // flow-root: a header's bottom margin stays inside the row, where it is measured.
          <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} className="flow-root" role={rowRole}>
            {render(rows[item.index], item.index)}
          </div>
        ))}
      </div>
    </div>
  )
}
