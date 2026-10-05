"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { MapPinOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { FallbackArt } from "@/components/explore/fallback-art"
import { kindLabel } from "@/components/explore/kind-icon"
import { flagFor } from "@/lib/explore/geo"
import type { Chapter } from "@/lib/library/chapters"
import type { LibraryItem } from "@/lib/library/types"
import type { CoverStats } from "./library-cover"
import { useLibraryActions } from "./library-actions"
import { LibraryPlaceMenu } from "./library-place-menu"

const LibraryMapbox = dynamic(() => import("./library-mapbox"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-secondary">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  ),
})

const HAS_TOKEN = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN)

function Row({ p, siblings }: { p: LibraryItem; siblings: string[] }) {
  const a = useLibraryActions()
  return (
    <div className={cn("flex items-center gap-3 py-2", a.selected.has(p.id) && "rounded-xl bg-primary/5")}>
      <button
        type="button"
        data-place-id={p.id}
        onClick={() => a.activate(p.id, siblings)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-16 sm:w-16">
          {p.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photos[0].thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <FallbackArt name={p.name} kind={p.kind} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[p.city, kindLabel(p.kind)].filter(Boolean).join(" · ")}
            {p.lat === null && " · not on the map"}
          </span>
        </span>
        {p.visitStatus === "visited" ? (
          <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">Been</span>
        ) : p.visitStatus === "planned" ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Planned</span>
        ) : null}
      </button>
      <LibraryPlaceMenu item={p} siblings={siblings} tone="plain" />
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
    const m = new Map<string, { city: string; country: string; n: number }>()
    for (const p of items) {
      if (!p.city?.trim()) continue
      const k = `${p.city.trim().toLowerCase()}|${p.country?.trim().toLowerCase() ?? ""}`
      const e = m.get(k) ?? { city: p.city.trim(), country: p.country?.trim() ?? "", n: 0 }
      e.n++
      m.set(k, e)
    }
    return [...m.values()].sort((x, y) => y.n - x.n || x.city.localeCompare(y.city)).slice(0, 6)
  }, [items])

  return (
    <div className="lg:grid lg:min-h-[calc(100vh-140px)] lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
      <div className="order-2 px-4 pb-10 pt-2 sm:px-8 lg:order-1 lg:max-h-[calc(100vh-130px)] lg:overflow-y-auto lg:border-r lg:pt-4">
        {chapters.map((c) => (
          <section key={c.key} aria-label={c.title} className="mb-4">
            {c.key !== "all" && (
              <div className="mb-0.5 mt-3 flex items-baseline gap-2">
                {c.flag && <span className="text-xl" aria-hidden>{c.flag}</span>}
                <h2 className="font-editorial text-[28px] leading-none">{c.title}</h2>
                <span className="text-xs text-muted-foreground">{c.items.length}</span>
              </div>
            )}
            {c.items.map((p) => (
              <Row key={p.id} p={p} siblings={siblings} />
            ))}
          </section>
        ))}
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
          <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-background/85 px-3 py-1 text-[11px] font-medium backdrop-blur">
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
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-accent" />Planned</span>
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
