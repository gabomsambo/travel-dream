"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RailRef } from "@/lib/explore/types"
import { useExplore } from "./explore-provider"
import { PlaceTile } from "./place-tile"

export function RailRow({
  rail,
  seeAllHref = `/explore/r/${rail.id}`,
  className,
}: {
  rail: RailRef
  /** null hides "See all" — for rails that only exist on one page. */
  seeAllHref?: string | null
  className?: string
}) {
  const { openPlace, places } = useExplore()
  const list = rail.placeIds.map((id) => places.get(id)).filter((p) => p !== undefined)
  const scroller = React.useRef<HTMLDivElement>(null)
  const [edge, setEdge] = React.useState({ start: true, end: false })

  const update = React.useCallback(() => {
    const el = scroller.current
    if (!el) return
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 })
  }, [])
  React.useEffect(update, [update])

  const page = (dir: 1 | -1) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" })
  }

  const ids = rail.placeIds

  return (
    <section className={cn("space-y-3", className)} aria-labelledby={`rail-${rail.id}`}>
      <div className="flex items-end gap-3 px-4 sm:px-8">
        <MaybeLink href={seeAllHref} className="group min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{rail.eyebrow}</p>
          <h2 id={`rail-${rail.id}`} className="flex items-center gap-1 font-heading text-xl font-semibold tracking-tight sm:text-2xl">
            <span className="truncate">{rail.title}</span>
            {seeAllHref && (
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
            )}
          </h2>
        </MaybeLink>
        <span className="mb-1 hidden text-xs text-muted-foreground sm:inline">{rail.placeIds.length} places</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => page(-1)}
            disabled={edge.start}
            aria-label={`Scroll ${rail.title} back`}
            className="hidden h-8 w-8 items-center justify-center rounded-full border transition hover:bg-secondary disabled:opacity-30 sm:flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => page(1)}
            disabled={edge.end}
            aria-label={`Scroll ${rail.title} forward`}
            className="hidden h-8 w-8 items-center justify-center rounded-full border transition hover:bg-secondary disabled:opacity-30 sm:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        onScroll={update}
        className={cn("flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 hide-scrollbar sm:scroll-px-8 sm:gap-4 sm:px-8")}
      >
        {list.map((p) => (
          <PlaceTile key={p.id} place={p} shape={rail.shape} caption={rail.captions[p.id]} onOpen={() => openPlace(p.id, ids)} />
        ))}
        {seeAllHref && (
        <Link
          href={seeAllHref}
          className={cn(
            "flex shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-sm font-medium text-muted-foreground transition hover:border-solid hover:bg-secondary hover:text-foreground",
            rail.shape === "landscape" ? "w-40" : "w-32"
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <ChevronRight className="h-5 w-5" />
          </span>
          See all
        </Link>
        )}
      </div>
    </section>
  )
}

function MaybeLink({ href, className, children }: { href: string | null; className?: string; children: React.ReactNode }) {
  return href ? <Link href={href} className={className}>{children}</Link> : <div className={className}>{children}</div>
}
