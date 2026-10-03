"use client"

import * as React from "react"
import { ArrowRight, ChevronLeft, ChevronRight, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/adapters/button"
import { flagFor } from "@/lib/explore/geo"
import type { FeaturedPick } from "@/lib/explore/types"
import { useExplore } from "./explore-provider"
import { FallbackArt } from "./fallback-art"

/**
 * The billboard: today's five picks, each there for a different reason, behind
 * page dots. The photo runs full-bleed and fades into the page, so the first
 * rail ("Right time, right place") sits over it.
 */
export function ExploreHero({ picks, greeting, stats }: { picks: FeaturedPick[]; greeting: string; stats: string }) {
  const { places, openPlace } = useExplore()
  const [index, setIndex] = React.useState(0)
  const featured = picks.flatMap((pick) => {
    const place = places.get(pick.placeId)
    return place ? [{ place, reason: pick.reason }] : []
  })
  const current = featured[index % Math.max(featured.length, 1)]
  if (!current) return null

  const { place, reason } = current
  const go = (next: number) => setIndex((next + featured.length) % featured.length)
  const location = [place.city, place.country].filter(Boolean).join(", ")
  const flag = flagFor(place.country)

  return (
    <section aria-roledescription="carousel" aria-label="Today's picks from your saves" className="relative overflow-hidden bg-black">
      <div key={place.id} className="absolute inset-0 animate-in fade-in zoom-in-[1.03] duration-700">
        {place.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={place.photos[0].uri} alt="" fetchPriority="high" className="h-full w-full object-cover opacity-90" />
        ) : (
          <FallbackArt name={place.name} kind={place.kind} />
        )}
      </div>
      {/* Readability scrims: left for the copy, bottom to melt into the first rail. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/70 to-transparent sm:h-44" />

      <div className="relative flex min-h-[min(80vh,42rem)] flex-col justify-between gap-10 px-4 pb-24 pt-6 sm:min-h-[38rem] sm:px-8 sm:pb-36 sm:pt-8">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-white">
          <h1 className="font-editorial text-3xl leading-none tracking-tight sm:text-4xl">{greeting}</h1>
          <p className="text-xs text-white/75 sm:text-sm">{stats}</p>
        </header>

        <div>
          <div key={`copy-${place.id}`} className="max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-500">
            <span className="inline-flex max-w-full items-center rounded-full border border-white/25 bg-black/30 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              <span className="truncate">{reason}</span>
            </span>
            <h2 className="mt-3 font-editorial text-5xl leading-[0.95] tracking-tight text-white drop-shadow-sm [text-wrap:balance] sm:text-7xl lg:text-8xl">
              {place.name}
            </h2>
            {location && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-white/85 sm:text-base">
                {flag ? <span aria-hidden>{flag}</span> : <MapPin className="h-4 w-4" aria-hidden />}
                {location}
              </p>
            )}
            {place.description && (
              <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-6 text-white/80 sm:text-base">{place.description}</p>
            )}
            {place.vibes.length > 0 && (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-white/60">
                {place.vibes.slice(0, 3).map((v) => v.replace(/-/g, " ")).join(" • ")}
              </p>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-2 sm:gap-3">
              <Button
                className="gap-2 rounded-full bg-white px-5 text-black hover:bg-white/90"
                onClick={() => openPlace(place.id, featured.map((f) => f.place.id))}
              >
                Take a look <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
          {featured.length > 1 && (
            <div className="-ml-0.5 mt-5 flex items-center gap-1 sm:absolute sm:bottom-36 sm:right-8 sm:ml-0 sm:mt-0">
              <button
                type="button"
                onClick={() => go(index - 1)}
                aria-label="Previous pick"
                className="hidden h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white sm:flex"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              {featured.map((f, dot) => (
                <button
                  key={f.place.id}
                  type="button"
                  onClick={() => go(dot)}
                  aria-label={`Show ${f.place.name}`}
                  aria-current={dot === index}
                  className="flex h-6 items-center px-0.5"
                >
                  <span className={cn("block h-1.5 rounded-full bg-white/45 transition-all", dot === index ? "w-6 bg-white" : "w-1.5")} />
                </button>
              ))}
              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label="Next pick"
                className="hidden h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white sm:flex"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
