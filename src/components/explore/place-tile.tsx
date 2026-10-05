"use client"

import type * as React from "react"
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
  // Used inside the magazine-spread grids on country/city pages, never in a rail.
  hero: "aspect-[16/9]",
}

/**
 * A photo-first card. The caption under the name says why the place is in this
 * rail; on pointer devices, hovering slides up a details drawer (description,
 * best time, vibes). Clicking opens the quick-look sheet.
 *
 * The card is one full-size button under the artwork, so the optional
 * `leading` (before the chips) and `actions` (top-right) slots can hold
 * controls of their own without nesting buttons.
 */
export function PlaceTile({
  place,
  shape,
  caption,
  captionQuote = false,
  onOpen,
  showPlanned = false,
  compact = false,
  leading,
  actions,
  selected = false,
  className,
}: {
  place: ExplorePlace
  shape: RailShape
  caption?: string
  /** Render the caption as the owner's own words: italic serif, in quotes. */
  captionQuote?: boolean
  onOpen: () => void
  /** Also mark planned places (Explore only marks the ones you've been to). */
  showPlanned?: boolean
  /**
   * Narrow tiles: one chip only — the visit status when there is one, else the
   * kind. `"mobile"` applies that below the `sm` breakpoint only.
   */
  compact?: boolean | "mobile"
  leading?: React.ReactNode
  actions?: React.ReactNode
  selected?: boolean
  className?: string
}) {
  const location = [place.city, place.country].filter(Boolean).join(", ")
  const about = place.description && place.description !== caption ? place.description : null
  const bestTime = place.bestTimeText && place.bestTimeText !== caption ? place.bestTimeText : null
  const vibes = place.vibes.slice(0, 3)
  const hasDetails = Boolean(about || bestTime || vibes.length)

  const been = place.visitStatus === "visited"
  const planned = showPlanned && place.visitStatus === "planned"
  const status = been ? (
    <span className="flex shrink-0 items-center rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-black">
      <Check className="mr-0.5 h-3 w-3" /> Been
    </span>
  ) : planned ? (
    <span className="shrink-0 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">Planned</span>
  ) : null
  const kindPill = (
    <span
      className={cn(
        "min-w-0 truncate rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md",
        compact === "mobile" && status && "max-sm:hidden"
      )}
    >
      {kindLabel(place.kind)}
    </span>
  )

  return (
    <div
      className={cn(
        "group relative shrink-0 snap-start overflow-hidden rounded-2xl bg-muted text-left",
        "ring-offset-background has-[>button:focus-visible]:ring-2 has-[>button:focus-visible]:ring-ring has-[>button:focus-visible]:ring-offset-2",
        selected && "ring-[3px] ring-primary ring-offset-2",
        SHAPES[shape],
        className
      )}
    >
      {place.photos[0] ? (
        // Plain <img>: photos are user content on Blob URLs, matching library-v2.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={place.photos[0].thumb}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
        />
      ) : (
        <FallbackArt name={place.name} kind={place.kind} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent transition-colors duration-300 [@media(hover:hover)]:group-hover:via-black/45" />

      <button
        type="button"
        onClick={onOpen}
        data-place-id={place.id}
        aria-label={[place.name, location, caption].filter(Boolean).join(", ")}
        className="absolute inset-0 z-[1] cursor-pointer rounded-[inherit] outline-none"
      />

      <div className={cn("pointer-events-none absolute left-3 top-3 z-[2] flex items-center gap-1.5", actions ? "right-11" : "right-3")}>
        {leading && <div className="pointer-events-auto">{leading}</div>}
        {compact === true ? (status ?? kindPill) : (
          <>
            {kindPill}
            {status}
          </>
        )}
      </div>

      {actions && <div className="absolute right-3 top-3 z-[2] flex flex-col items-center gap-1.5">{actions}</div>}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3.5">
        {location && (
          <p className="truncate text-[11px] font-medium text-white/75">
            {flagFor(place.country) && <span className="mr-1">{flagFor(place.country)}</span>}
            {location}
          </p>
        )}
        <h3 className={cn("mt-0.5 font-editorial leading-[1.02] text-white", shape === "landscape" ? "text-2xl" : "text-[22px]", shape === "hero" && "text-3xl")}>
          {place.name}
        </h3>
        {caption && (
          <p
            className={cn(
              "mt-1.5 line-clamp-2 leading-snug text-white/80",
              captionQuote ? "font-editorial text-[13px] italic" : "text-[11px]"
            )}
          >
            {captionQuote ? `“${caption}”` : caption}
          </p>
        )}

        {/* Hover drawer: collapsed on touch screens, slides open under a pointer. */}
        {hasDetails && (
          <div
            aria-hidden
            className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out [@media(hover:hover)]:group-hover:grid-rows-[1fr] [@media(hover:hover)]:group-has-[>button:focus-visible]:grid-rows-[1fr]"
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
    </div>
  )
}
