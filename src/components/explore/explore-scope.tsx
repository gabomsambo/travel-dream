import type * as React from "react"
import type { ExploreCollection, ExplorePlace } from "@/lib/explore/types"
import { ExploreProvider } from "./explore-provider"

/** The places a page renders, in the order the server loaded them. */
export function scopePlaces(places: ExplorePlace[], ids: Iterable<string>): ExplorePlace[] {
  const want = new Set(ids)
  return places.filter((p) => want.has(p.id))
}

/**
 * The client provider for one Explore page. It runs on the server, so only the
 * places the page renders are serialized into the payload: the layout used to
 * hand over the whole library, which every Explore route (and every link
 * prefetch of one) then paid for. Quick look's "Also in this city" fetches the
 * neighbours when the sheet opens instead of scanning a map that is no longer
 * there.
 */
export function ExploreScope({
  places,
  ids,
  collections,
  children,
}: {
  places: ExplorePlace[]
  ids: Iterable<string>
  collections: ExploreCollection[]
  children: React.ReactNode
}) {
  return (
    <ExploreProvider places={scopePlaces(places, ids)} collections={collections} sameCity="fetch">
      {children}
    </ExploreProvider>
  )
}
