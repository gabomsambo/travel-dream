"use client"

// The gallery as one virtualized list of rows (chapter headers, rows of tiles, the
// phone interlude); see VirtualRows for how the window is kept.

import * as React from "react"
import { cn } from "@/lib/utils"
import type { Chapter } from "@/lib/library/chapters"
import { MOBILE_PEEK, DESKTOP_PEEK, buildGalleryRows, rowChapterKey, type GalleryRow } from "@/lib/library/gallery-rows"
import type { GroupMode } from "@/lib/library/types"
import { CityChips, MoreTile } from "./library-chapter-parts"
import { LibraryTile } from "./library-tile"
import { VirtualRows, type VirtualRowsHandle } from "./virtual-rows"

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

export type VirtualGalleryHandle = VirtualRowsHandle

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

  const gap = phone ? 10 : 14
  const estimate = React.useCallback(
    (row: GalleryRow, width: number) => {
      // Close to what the rows measure at 5,000 places, so the scrollbar barely moves as rows get measured.
      if (row.kind === "header") {
        if (group === "country") return phone ? 118 : 204
        return (row.chapter.eyebrow ? 21 : 0) + (phone ? 74 : 92)
      }
      if (row.kind === "interlude") return phone ? 360 : 0
      if (row.kind === "pager") return 96
      return ((width - (cols - 1) * gap) / cols) * (4 / 3) + (row.last ? (phone ? 40 : 48) : gap)
    },
    [group, phone, cols, gap]
  )

  const expand = React.useCallback((key: string) => setExpanded((s) => new Set(s).add(key)), [])
  const setCity = React.useCallback((key: string, city: string | null) => setCityBy((m) => new Map(m).set(key, city)), [])
  const morePages = React.useCallback(() => setPages((n) => n + 1), [])

  return (
    <VirtualRows
      rows={rows}
      estimate={estimate}
      layoutKey={`${cols}:${peek}`}
      chapterOf={rowChapterKey}
      onActive={onActive}
      handle={handle}
      render={(row) => (
        <RowView
          row={row}
          siblings={siblings}
          header={header}
          showCities={group === "country"}
          onCity={setCity}
          onExpand={expand}
          onMorePages={morePages}
          interlude={interlude}
        />
      )}
    />
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
