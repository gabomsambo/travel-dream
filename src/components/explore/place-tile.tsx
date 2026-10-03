"use client"

import { CalendarHeart, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ExplorePlace, RailShape } from "@/lib/explore/types"
import { flagFor } from "@/lib/explore/geo"
import { FallbackArt } from "./fallback-art"
import { kindLabel } from "./kind-icon"

const SHAPES: Record<RailShape, string> = {
  // Widths are chosen so the last card is always cut off: the peek is the scroll hint.
  landscape: "w-[72vw] sm:w-[340px] aspect-[4/3]",
  poster: "w-[44vw] sm:w-[210px] aspect-[3/4]",
}

/**
 * A photo-first card. The caption under the name says why the place is in this
 * rail; on pointer devices, hovering slides up a details drawer (description,
 * best time, vibes). Clicking opens the quick-look sheet.
 */
export function PlaceTile({
  place,
  shape,
  caption,
  onOpen,
  className,
}: {
  place: ExplorePlace
  shape: RailShape
  caption?: string
  onOpen: () => void
  className?: string
}) {
  const location = [place.city, place.country].filter(Boolean).join(", ")
  const about = place.description && place.description !== caption ? place.description : null
  const bestTime = place.bestTimeText && place.bestTimeText !== caption ? place.bestTimeText : null
  const vibes = place.vibes.slice(0, 3)
  const hasDetails = Boolean(about || bestTime || vibes.length)

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={[place.name, location, caption].filter(Boolean).join(", ")}
      className={cn(
        "group relative shrink-0 snap-start overflow-hidden rounded-2xl bg-muted text-left outline-none",
        "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        SHAPES[shape],
        className
      )}
    >
      {place.photos[0] ? (
        // Plain <img>: photos are user content on Blob URLs, matching library-v2.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={place.photos[0]}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
        />
      ) : (
        <FallbackArt name={place.name} kind={place.kind} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent transition-colors duration-300 [@media(hover:hover)]:group-hover:via-black/45" />

      <div className="absolute left-3 top-3 flex gap-1.5">
        <span className="rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md">
          {kindLabel(place.kind)}
        </span>
        {place.visitStatus === "visited" && (
          <span className="flex items-center rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-black">
            <Check className="mr-0.5 h-3 w-3" /> Been
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3.5">
        {location && (
          <p className="truncate text-[11px] font-medium text-white/75">
            {flagFor(place.country) && <span className="mr-1">{flagFor(place.country)}</span>}
            {location}
          </p>
        )}
        <h3 className={cn("mt-0.5 font-editorial leading-[1.02] text-white", shape === "landscape" ? "text-2xl" : "text-[22px]")}>
          {place.name}
        </h3>
        {caption && <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-white/80">{caption}</p>}

        {/* Hover drawer: collapsed on touch screens, slides open under a pointer. */}
        {hasDetails && (
          <div
            aria-hidden
            className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out [@media(hover:hover)]:group-hover:grid-rows-[1fr] [@media(hover:hover)]:group-focus-visible:grid-rows-[1fr]"
          >
            <div className="min-h-0 overflow-hidden">
              {about && <p className="mt-2 line-clamp-3 text-xs leading-snug text-white/90">{about}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                {bestTime && (
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                    <CalendarHeart className="h-3 w-3 shrink-0" />
                    <span className="truncate">{bestTime}</span>
                  </span>
                )}
                {vibes.map((v) => (
                  <span key={v} className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                    {v.replace(/-/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </button>
  )
}
