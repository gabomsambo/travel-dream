"use client"

import Link from "next/link"
import { Photo } from "@/components/photo"
import type { BrowseRail, RailGroup } from "@/lib/explore/types"
import { FallbackArt } from "./fallback-art"

const GROUPS: Array<{ id: RailGroup; label: string }> = [
  { id: "timing", label: "Timing" },
  { id: "moods", label: "Moods" },
  { id: "people", label: "From people you trust" },
  { id: "food", label: "Eat & drink" },
  { id: "list", label: "Your list" },
]

/**
 * Every rail the library can make, not just today's home page: nothing your
 * saves support is ever out of reach.
 */
export function BrowseAll({ rails }: { rails: BrowseRail[] }) {
  return (
    <section aria-labelledby="browse-all" className="space-y-7 px-4 sm:px-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Browse all</p>
        <h2 id="browse-all" className="font-editorial text-4xl leading-tight sm:text-5xl">
          Every way into your saves
        </h2>
      </div>
      {GROUPS.map((group) => {
        const items = rails.filter((r) => r.group === group.id)
        if (items.length === 0) return null
        return (
          <div key={group.id} className="space-y-2.5">
            <h3 className="text-sm font-semibold text-muted-foreground">{group.label}</h3>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 2xl:grid-cols-6">
              {items.map((rail) => {
                return (
                  <Link
                    key={rail.id}
                    href={`/explore/r/${rail.id}`}
                    className="group relative block h-28 min-w-0 overflow-hidden rounded-2xl bg-muted outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-32"
                  >
                    {rail.cover ? (
                      <Photo
                        src={rail.cover}
                        sizes="(min-width: 1536px) 16vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                        className="transition duration-700 group-hover:scale-105"
                      />
                    ) : (
                      rail.fallback && <FallbackArt name={rail.fallback.name} kind={rail.fallback.kind} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="line-clamp-2 font-editorial text-xl leading-[1.05] text-white sm:text-2xl">{rail.title}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-white/75">{rail.count} places</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
}
