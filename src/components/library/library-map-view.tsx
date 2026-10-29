"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { MapPinOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { flagFor } from "@/lib/explore/geo"
import { tallyCities } from "@/lib/city-names"
import type { Chapter } from "@/lib/library/chapters"
import type { LibraryItem } from "@/lib/library/types"
import type { CoverStats } from "./library-cover"
import { useLibraryActions } from "./library-actions"
import { VirtualEntries } from "./library-entries"

const LibraryMapbox = dynamic(() => import("./library-mapbox"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-secondary">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  ),
})

const HAS_TOKEN = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN)

/** A chapter's title above its places in the side list. */
function chapterTitle(c: Chapter) {
  return (
    <div className="mb-0.5 mt-3 flex items-baseline gap-2">
      {c.flag && <span className="text-xl" aria-hidden>{c.flag}</span>}
      <h2 className="font-editorial text-[28px] leading-none">{c.title}</h2>
      <span className="text-xs text-muted-foreground">{c.items.length}</span>
    </div>
  )
}

/**
 * The atlas as a map: chapters as a list on the left, the pins on the right,
 * with the passport and your most-saved cities under the map.
 */
export function LibraryMapView({
  chapters,
  items,
  siblings,
  stats,
}: {
  chapters: Chapter[]
  items: LibraryItem[]
  siblings: string[]
  stats: CoverStats
}) {
  const a = useLibraryActions()
  const pinned = items.filter((p) => p.lat !== null && p.lon !== null).length
  const beenCountries = stats.passport.filter((c) => c.been).length
  const plannedCountries = new Set(items.filter((p) => p.visitStatus === "planned").map((p) => p.country?.trim().toLowerCase()).filter(Boolean)).size
  const waiting = items.filter((p) => p.visitStatus === "not_visited").length

  const topCities = React.useMemo(() => {
    return tallyCities(items).slice(0, 6).map((c) => ({ city: c.city, country: c.country, n: c.count }))
  }, [items])

  return (
    <div className="flex flex-col lg:grid lg:min-h-[calc(100vh-140px)] lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
      <div data-side-list className="order-2 px-4 pb-10 pt-2 sm:px-8 lg:order-1 lg:max-h-[calc(100vh-130px)] lg:overflow-y-auto lg:border-r lg:pt-4">
        <VirtualEntries chapters={chapters} group="none" view="map" siblings={siblings} header={chapterTitle} />
      </div>

      <div className="order-1 space-y-4 p-4 sm:p-5 lg:order-2 lg:sticky lg:top-[40px] lg:self-start">
        <div className="relative h-[46vh] min-h-[300px] overflow-hidden rounded-3xl bg-secondary lg:h-[min(520px,56vh)]">
          {HAS_TOKEN ? (
            <LibraryMapbox items={items} onOpen={(id) => a.openPlace(id, siblings)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <MapPinOff className="h-8 w-8" />
              <p className="font-medium text-foreground">The map can&apos;t load here</p>
              <p className="max-w-xs">No Mapbox token is configured for this deployment. The list beside it still opens every place.</p>
            </div>
          )}
          {/* Top-left: the bottom-left corner is reserved for the Mapbox wordmark. */}
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/85 px-3 py-1 text-[11px] font-medium backdrop-blur">
            {pinned} of {items.length} on the map
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          <div className="rounded-[20px] border p-4 sm:px-[18px]">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Passport</p>
            <p className="flex flex-wrap gap-[3px] text-[17px] leading-tight">
              {stats.passport.map((c) => (
                <span key={c.country} title={`${c.country}${c.been ? " · been" : ""}`} className={cn(!c.been && "opacity-40 grayscale-[.6]")}>
                  {c.flag || "🏳️"}
                </span>
              ))}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-primary" />Been · {beenCountries} {beenCountries === 1 ? "country" : "countries"}</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--map-planned))]" />Planned</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-foreground" />Dreaming · cluster</span>
            </div>
            <p className="mt-3.5 font-editorial text-2xl leading-[1.1]">
              “{waiting} {waiting === 1 ? "place" : "places"} still waiting
              {plannedCountries ? ` — ${plannedCountries} ${plannedCountries === 1 ? "country already has" : "countries already have"} a date.` : "."}”
            </p>
          </div>
          {topCities.length > 0 && (
            <div className="rounded-[20px] border p-4 sm:px-[18px]">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Most-saved cities</p>
              {topCities.map((c) => (
                <div key={c.city + c.country} className="flex items-center gap-2 border-b py-1.5 last:border-b-0">
                  <span aria-hidden>{flagFor(c.country)}</span>
                  <span className="flex-1 truncate font-editorial text-[21px]">{c.city}</span>
                  <span className="text-xs text-muted-foreground">{c.n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
