"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PlaceTile } from "@/components/explore/place-tile"
import { editorialFont } from "@/components/explore/fonts"
import type { ExplorePlace } from "@/lib/explore/types"

const caption = (p: ExplorePlace) => p.bestTimeText ?? p.recommendedBy ?? ""

/**
 * The user's other saves in this city, as Explore's poster rail. Clicking a
 * tile opens that place. Hidden entirely when there are no neighbours, so a
 * first save in a city reads as a clean ending rather than an empty rail.
 */
export function AlsoInCity({ city, places }: { city: string; places: ExplorePlace[] }) {
  const router = useRouter()
  if (places.length === 0) return null

  return (
    <section aria-labelledby="place-also-in" className={`${editorialFont.variable} space-y-3`}>
      <div className="px-4 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Also in {city}</p>
        <h2 id="place-also-in" className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
          {places.length} more {places.length === 1 ? "save" : "saves"} nearby
        </h2>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-1 hide-scrollbar sm:gap-4 sm:px-8">
        {places.map((p) => (
          <PlaceTile key={p.id} place={p} shape="poster" caption={caption(p)} onOpen={() => router.push(`/place/${p.id}`)} />
        ))}
      </div>
    </section>
  )
}
