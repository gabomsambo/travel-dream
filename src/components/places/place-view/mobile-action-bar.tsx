"use client"

import { Navigation, Phone } from "lucide-react"
import { usablePin } from "@/lib/place-coords"
import type { ExploreCollection } from "@/lib/explore/types"
import type { PlaceWithRelations } from "@/types/database"
import { AddToTripMenu } from "./add-to-trip-menu"

export function directionsUrl(coords: { lat: number; lon: number } | null): string | null {
  const pin = usablePin(coords)
  return pin ? `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lon}` : null
}

export function callUrl(phone: string | null): string | null {
  return phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : null
}

/**
 * The mobile hand-in-pocket bar: Directions, Add to trip, Call. Directions and
 * Call disappear when the place has no coordinates or phone, so a sparse place
 * only ever shows what it can actually do.
 */
export function MobileActionBar({
  place,
  trips,
  onChanged,
  blockWrites = false,
}: {
  place: PlaceWithRelations
  trips: ExploreCollection[]
  onChanged: () => void
  blockWrites?: boolean
}) {
  const dirUrl = directionsUrl(place.coords)
  const call = callUrl(place.phone)
  if (blockWrites && !dirUrl && !call) return null

  return (
    // The scroller (<main> in (app)/layout.tsx) pads its bottom edge with
    // p-3 sm:p-6, and a sticky element stops at that padding edge — leaving a
    // strip of content visible under the bar. The negative bottom offset
    // sticks the bar flush with the viewport and the matching negative margin
    // keeps it from reserving that strip in the scroll flow.
    <div className="sticky bottom-[-0.75rem] z-30 -mb-3 border-t bg-background/95 px-3 pb-5 pt-3 backdrop-blur sm:bottom-[-1.5rem] sm:-mb-6 lg:hidden">
      <div className="flex gap-2">
        {dirUrl && (
          <a
            href={dirUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-foreground py-2.5 text-sm font-semibold text-background transition hover:bg-foreground/90"
          >
            <Navigation className="h-4 w-4" aria-hidden /> Directions
          </a>
        )}
        {!blockWrites && (
          <AddToTripMenu
            placeId={place.id}
            placeName={place.name}
            placeCity={place.city}
            trips={trips}
            onChanged={onChanged}
            triggerClassName="flex-1 justify-center py-2.5 text-sm font-semibold"
          />
        )}
        {call && (
          <a href={call} aria-label={`Call ${place.name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition hover:bg-secondary">
            <Phone className="h-4 w-4" aria-hidden />
          </a>
        )}
      </div>
    </div>
  )
}
