"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { flagFor } from "@/lib/explore/geo"
import { groupBySlug } from "@/lib/explore/atlas"
import type { LibraryItem } from "@/lib/library/types"
import type { Shelf } from "@/lib/library/filters"
import type { GroupMode } from "@/lib/library/types"

const SCENIC = new Set(["landmark", "natural", "viewpoint", "beach", "neighborhood", "park"])

/** Up to `n` cover photos, one country at a time first so the collage reads as a journey. */
export function coverPhotos(items: LibraryItem[], n: number): Array<{ id: string; src: string; thumb: string }> {
  const score = (p: LibraryItem) => p.priority + (SCENIC.has(p.kind) ? 2 : 0) + (p.visitStatus === "visited" ? 1 : 0)
  const ranked = items.filter((p) => p.photos.length).sort((a, b) => score(b) - score(a) || a.createdAt.localeCompare(b.createdAt))
  const picked: LibraryItem[] = []
  const countries = new Set<string>()
  for (const p of ranked) {
    const c = p.country?.trim().toLowerCase() ?? ""
    if (countries.has(c)) continue
    countries.add(c)
    picked.push(p)
    if (picked.length === n) break
  }
  for (const p of ranked) {
    if (picked.length === n) break
    if (!picked.includes(p)) picked.push(p)
  }
  return picked.map((p) => ({ id: p.id, src: p.photos[0].uri, thumb: p.photos[0].thumb }))
}

export interface CoverStats {
  total: number
  countries: number
  cities: number
  been: number
  planned: number
  dreaming: number
  /** Every country, most-saved first, with whether you've been. */
  passport: Array<{ country: string; flag: string; been: boolean }>
}

export function coverStats(items: LibraryItem[]): CoverStats {
  const located = items.filter((p) => p.country?.trim())
  const groups = groupBySlug(located, (p) => p.country!.trim()).sort((a, b) => b.places.length - a.places.length)
  const cities = new Set(items.filter((p) => p.city?.trim()).map((p) => `${p.city!.trim().toLowerCase()}|${p.country?.trim().toLowerCase() ?? ""}`))
  return {
    total: items.length,
    countries: groups.length,
    cities: cities.size,
    been: items.filter((p) => p.visitStatus === "visited").length,
    planned: items.filter((p) => p.visitStatus === "planned").length,
    dreaming: items.filter((p) => p.visitStatus === "not_visited").length,
    passport: groups.map((g) => ({
      country: g.name,
      flag: flagFor(g.name),
      been: g.places.some((p) => p.visitStatus === "visited"),
    })),
  }
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * The journal cover: a collage of your own photos, the stats as one sentence
 * (each number applies its shelf), and the flags you've collected.
 */
export function LibraryCover({
  items,
  stats,
  onShelf,
  onGroup,
}: {
  items: LibraryItem[]
  stats: CoverStats
  onShelf: (shelf: Shelf) => void
  onGroup: (group: GroupMode) => void
}) {
  const photos = React.useMemo(() => coverPhotos(items, 7), [items])
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={i === 0 ? p.src : p.thumb} alt="" className="absolute inset-0 h-full w-full object-cover animate-in fade-in-0 duration-700" />
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

/** "Search your atlas…": the Library's own search, the same fuzzy index as before. `/` focuses it. */
export const LibrarySearchPill = React.forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; className?: string }
>(function LibrarySearchPill({ value, onChange, className }, ref) {
  return (
    <div
      className={cn(
        "relative z-10 flex h-[50px] items-center gap-3 rounded-full border bg-card pl-5 pr-2.5 shadow-[0_8px_28px_rgba(0,0,0,.12)] sm:h-[60px] sm:pl-[22px]",
        "focus-within:ring-2 focus-within:ring-ring",
        className
      )}
    >
      <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search your atlas…"
        name="library-search"
        aria-label="Search your library"
        className="min-w-0 flex-1 bg-transparent font-editorial text-[21px] text-foreground outline-none placeholder:text-muted-foreground sm:text-[26px] [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <kbd className="mr-1 hidden rounded-md border px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground sm:block" title="Press / to search">
          /
        </kbd>
      )}
    </div>
  )
})
