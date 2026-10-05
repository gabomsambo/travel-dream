"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { FolderPlus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/adapters/dropdown-menu"
import { notify } from "@/lib/notify"
import type { ExploreCollection } from "@/lib/explore/types"

// The trip is created before the place goes in, so a failed add leaves a real,
// empty trip behind. Remember it per place, shared by every menu on the page and
// across view/edit remounts, so a retry fills that trip instead of creating a
// second one under the same name (as Explore's provider does).
const halfBuiltTrips = new Map<string, string>()

export function resetHalfBuiltTripsForTests() {
  halfBuiltTrips.clear()
}

/**
 * "Add to trip", reusing the same collection endpoints Explore's sheet uses.
 * The list is the caller's full trip set (with `placeIds`), so membership can be
 * read client-side: the menu marks the trips this place is already in and offers
 * the rest, plus "New trip with this place".
 */
export function AddToTripMenu({
  placeId,
  placeName,
  placeCity,
  trips,
  onChanged,
  triggerClassName,
  label = "Add to trip",
}: {
  placeId: string
  placeName: string
  placeCity: string | null
  trips: ExploreCollection[]
  onChanged: () => void
  triggerClassName?: string
  label?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const halfBuiltId = halfBuiltTrips.get(placeId)
    if (halfBuiltId && trips.some((t) => t.id === halfBuiltId && t.placeIds.includes(placeId))) {
      halfBuiltTrips.delete(placeId)
    }
  }, [placeId, trips])

  const inTrips = trips.filter((t) => t.placeIds.includes(placeId))
  const available = trips.filter((t) => !t.placeIds.includes(placeId))

  const postPlace = async (collectionId: string) => {
    const res = await fetch(`/api/collections/${collectionId}/places`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeIds: [placeId] }),
    })
    const body = (await res.json().catch(() => null)) as { results?: { failed?: unknown[] } } | null
    if (!res.ok || res.status === 207 || (body?.results?.failed?.length ?? 0) > 0) {
      throw new Error("Couldn't add to that trip")
    }
  }

  const added = (collectionId: string, name: string) => {
    notify.success(`Added to ${name}`, {
      action: { label: "Open", onClick: () => router.push(`/collections/${collectionId}/planner`) },
    })
    onChanged()
  }

  const addToTrip = async (collectionId: string, name: string) => {
    setBusy(true)
    try {
      await postPlace(collectionId)
      if (halfBuiltTrips.get(placeId) === collectionId) halfBuiltTrips.delete(placeId)
      added(collectionId, name)
    } catch {
      notify.error("Couldn't add to that trip.")
    } finally {
      setBusy(false)
    }
  }

  const newTrip = async () => {
    setBusy(true)
    const name = placeCity ? `${placeCity} trip` : `${placeName} trip`
    try {
      let id = halfBuiltTrips.get(placeId)
      if (id && !trips.some((t) => t.id === id)) {
        halfBuiltTrips.delete(placeId)
        id = undefined
      }
      if (!id) {
        const res = await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description: "Saved from a place" }),
        })
        if (!res.ok) throw new Error("Couldn't create that trip")
        const { collection } = (await res.json()) as { collection: { id: string } }
        id = collection.id
        halfBuiltTrips.set(placeId, id)
      }
      await postPlace(id)
      halfBuiltTrips.delete(placeId)
      added(id, name)
    } catch {
      const halfBuilt = halfBuiltTrips.has(placeId)
      notify.error(
        halfBuilt ? `${name} was created, but this place didn't save to it.` : "Couldn't create that trip. Try again in a moment.",
        halfBuilt ? { description: "Try again to add it — you won't get a second copy." } : undefined
      )
      // The half-built trip is real; refresh so it shows up in the menu.
      if (halfBuilt) onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition hover:bg-secondary disabled:opacity-60",
            triggerClassName
          )}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {inTrips.length > 0 && (
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Already in {inTrips.map((c) => c.name).join(", ")}
          </DropdownMenuLabel>
        )}
        {available.map((trip) => (
          <DropdownMenuItem key={trip.id} onSelect={() => void addToTrip(trip.id, trip.name)}>
            {trip.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void newTrip()}>
          <FolderPlus className="mr-2 h-4 w-4" aria-hidden /> New trip with this place
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
