"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Photo } from "@/components/photo"
import { coverPhotos, coverStats, type CoverPhoto, type CoverStats } from "@/lib/library/cover"
import type { LibraryItem } from "@/lib/library/types"
import type { Shelf } from "@/lib/library/filters"
import type { GroupMode } from "@/lib/library/types"

export { coverPhotos, coverStats }
export type { CoverStats }

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * The journal cover: a collage of your own photos, the stats as one sentence
 * (each number applies its shelf), and the flags you've collected.
 */
export function LibraryCover({
  items,
  photos: given,
  stats,
  onShelf,
  onGroup,
}: {
  /** The whole library; the collage is picked from it. */
  items?: LibraryItem[]
  /** The collage already picked (the server's first screen has no library to pick from). */
  photos?: CoverPhoto[]
  stats: CoverStats
  onShelf: (shelf: Shelf) => void
  onGroup: (group: GroupMode) => void
}) {
  const photos = React.useMemo(() => given ?? coverPhotos(items ?? [], 7), [given, items])
  const beenCountries = stats.passport.filter((c) => c.been).length
  const link = "rounded underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-white/70"
  const stat = (n: number, label: string, shelf: Shelf, strong = true) => (
    <button type="button" onClick={() => onShelf(shelf)} className={link}>
      {strong ? <b className="font-semibold text-white">{n}</b> : n} {label}
    </button>
  )
  const by = (label: string, group: GroupMode) => (
    <button type="button" onClick={() => onGroup(group)} className={link} title={`Group by ${group}`}>
      {label}
    </button>
  )

  return (
    <section className="relative h-[250px] overflow-hidden bg-neutral-900 sm:h-[300px]" aria-label="Your atlas">
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-[3px] sm:grid-cols-5">
        {photos.map((p, i) => (
          <div
            key={p.id}
            className={cn("relative overflow-hidden", i === 0 && "col-span-2 row-span-2", i >= 3 && "hidden sm:block")}
          >
            <Photo
              src={p.src}
              thumb={p.thumb}
              use={i === 0 ? "full" : "thumb"}
              sizes={i === 0 ? "(min-width: 640px) 40vw, 67vw" : "(min-width: 640px) 20vw, 34vw"}
              priority={i === 0}
              className="animate-in fade-in-0 duration-700"
            />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/15" />
      <div className="absolute inset-x-0 bottom-0 h-[90px] bg-gradient-to-t from-background to-transparent" />

      <div className="absolute bottom-[46px] left-4 right-4 max-w-[680px] text-white sm:bottom-16 sm:left-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">Your library</p>
        <h1 className="mt-1.5 font-editorial text-[52px] leading-[0.92] sm:text-[76px]">Your atlas</h1>
        <p className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-white/85 sm:text-sm">
          {stat(stats.total, stats.total === 1 ? "place" : "places", "all", false)}
          <span aria-hidden>·</span>
          {by(plural(stats.countries, "country", "countries"), "country")}
          <span aria-hidden className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{by(plural(stats.cities, "city", "cities"), "city")}</span>
          <span aria-hidden>·</span>
          {stat(stats.been, "been", "visited")}
          <span aria-hidden>·</span>
          {stat(stats.planned, "planned", "planned")}
          <span aria-hidden className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{stat(stats.dreaming, "still dreaming", "not_visited")}</span>
        </p>
        {stats.passport.length > 0 && (
          <div className="mt-2.5 hidden items-center gap-2.5 sm:flex">
            <p className="flex flex-wrap items-center gap-[3px] text-[17px] leading-none" aria-label={`Flags of the ${stats.countries} countries you've saved`}>
              {stats.passport.map((c) => (
                <span
                  key={c.country}
                  title={`${c.country}${c.been ? " · been" : ""}`}
                  className={cn(!c.been && "opacity-40 grayscale-[.6]")}
                >
                  {c.flag || "🏳️"}
                </span>
              ))}
            </p>
            <span className="whitespace-nowrap text-[11px] text-white/70">
              Been to {beenCountries} of {stats.countries}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

/** The cover for a library that is just starting: a duotone poster, no collage to fill. */
export function SparseCover({ total, countries }: { total: number; countries: number }) {
  return (
    <section className="relative h-[230px] overflow-hidden bg-gradient-to-br from-indigo-700 to-slate-900 sm:h-[250px]" aria-label="Your atlas">
      <div className="absolute inset-x-0 bottom-0 h-[90px] bg-gradient-to-t from-background to-transparent" />
      <div className="absolute bottom-12 left-4 right-4 text-white sm:bottom-14 sm:left-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">Your library</p>
        <h1 className="mt-1.5 font-editorial text-[44px] leading-[0.92] sm:text-[68px]">Your atlas starts here</h1>
        <p className="mt-2 text-[13px] text-white/85 sm:text-sm">
          {total > 0
            ? `${plural(total, "place")} · ${plural(countries, "country", "countries")} — every screenshot you drop in becomes a page of it.`
            : "Every screenshot you drop in becomes a page of it."}
        </p>
      </div>
    </section>
  )
}
