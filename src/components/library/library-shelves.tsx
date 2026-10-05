"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Inbox, Plus, Shuffle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Shelf } from "@/lib/library/filters"
import type { ExploreCollection } from "@/lib/explore/types"
import type { LibraryItem } from "@/lib/library/types"
import { collectionEyebrow } from "@/lib/library/chapters"

const SHELVES: Array<{ value: Shelf; label: string }> = [
  { value: "all", label: "All" },
  { value: "not_visited", label: "Dreaming" },
  { value: "planned", label: "Planned" },
  { value: "visited", label: "Been" },
]

/**
 * All · Dreaming · Planned · Been — the visit-status filter as shelves — and
 * "Needs review", which leaves for the Inbox rather than mixing unconfirmed
 * places in. `active` is null when the filter panel holds a custom mix.
 */
export function LibraryShelves({
  active,
  counts,
  inboxCount,
  onShelf,
}: {
  active: Shelf | null
  counts: Record<Shelf, number>
  inboxCount: number
  onShelf: (shelf: Shelf) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="-mx-4 flex min-w-0 flex-1 scroll-px-4 items-center gap-2 overflow-x-auto px-4 pb-1 hide-scrollbar sm:mx-0 sm:px-0 sm:pb-0">
        <div role="group" aria-label="Shelves" className="inline-flex shrink-0 gap-0.5 rounded-full bg-secondary p-[3px]">
          {SHELVES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={active === s.value}
              onClick={() => onShelf(s.value)}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                active === s.value ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"
              )}
            >
              {s.label}
              <small className="ml-1 text-[11px] font-medium opacity-60">{counts[s.value]}</small>
            </button>
          ))}
        </div>
        <Link
          href="/inbox"
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-[7px] text-[13px] font-medium text-muted-foreground outline-none transition hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Inbox className="h-3.5 w-3.5" />
          Needs review
          {inboxCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{inboxCount}</span>
          )}
          <ArrowRight className="h-3 w-3 opacity-60" />
        </Link>
      </div>
      <Link
        href="/explore/shuffle"
        className="hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium outline-none transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
      >
        <Shuffle className="h-3.5 w-3.5" /> Shuffle my places
      </Link>
    </div>
  )
}

function Collage({ photos }: { photos: string[] }) {
  return (
    <div className="grid aspect-[4/3] grid-cols-[2fr_1fr] grid-rows-2 gap-[3px] overflow-hidden rounded-2xl bg-muted">
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn("relative overflow-hidden bg-muted-foreground/10", i === 0 && "row-span-2")}>
          {photos[i] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photos[i]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
          )}
        </div>
      ))}
    </div>
  )
}

/** "Your collections · Trips & lists": each collection as a three-photo collage cover. */
export function TripsShelf({
  collections,
  byId,
  now,
}: {
  collections: ExploreCollection[]
  byId: Map<string, LibraryItem>
  now: Date
}) {
  const headingId = React.useId()
  if (!collections.length) return null
  const shown = [...collections].sort((a, b) => b.placeIds.length - a.placeIds.length).slice(0, 5)
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex items-end gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Your collections</p>
          <h2 id={headingId} className="mt-0.5 font-heading text-lg font-semibold tracking-tight sm:text-[22px]">
            Trips &amp; lists
          </h2>
        </div>
        <Link href="/collections" className="ml-auto whitespace-nowrap text-xs text-muted-foreground hover:text-foreground">
          {collections.length} {collections.length === 1 ? "collection" : "collections"} · See all →
        </Link>
      </div>
      <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 hide-scrollbar sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3.5 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        {shown.map((c) => {
          const members = c.placeIds.map((id) => byId.get(id)).filter((p): p is LibraryItem => !!p)
          const photos = members.filter((p) => p.photos.length).slice(0, 3).map((p) => p.photos[0].thumb)
          const sub = c.description?.trim() || collectionEyebrow(members, now)
          return (
            <Link
              key={c.id}
              href={`/collections/${c.id}`}
              className="group w-[38vw] shrink-0 snap-start rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
            >
              <Collage photos={photos} />
              <p className="mt-1.5 truncate text-[13px] font-semibold sm:mt-2">{c.name}</p>
              <p className="line-clamp-1 text-xs text-muted-foreground sm:line-clamp-2">
                {c.placeIds.length} {c.placeIds.length === 1 ? "place" : "places"}
                {sub ? ` · ${sub}` : ""}
              </p>
            </Link>
          )
        })}
        <Link
          href="/collections"
          className="flex aspect-[4/3] w-[38vw] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-[13px] font-medium text-muted-foreground outline-none transition hover:bg-secondary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground">
            <Plus className="h-[18px] w-[18px]" />
          </span>
          New collection
        </Link>
      </div>
    </section>
  )
}
