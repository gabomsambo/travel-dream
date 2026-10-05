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
  // The trip is created before the place goes in, so a failed add leaves a real,
  // empty trip behind. Remember it so a retry fills that trip instead of
  // creating a second one under the same name (as Explore's provider does).
  const halfBuilt = React.useRef<string | null>(null)

  const inTrips = trips.filter((t) => t.placeIds.includes(placeId))
  const available = trips.filter((t) => !t.placeIds.includes(placeId))

  const postPlace = async (collectionId: string) => {
    const res = await fetch(`/api/collections/${collectionId}/places`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeIds: [placeId] }),
    })
    if (!res.ok) throw new Error("Couldn't add to that trip")
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
      let id = halfBuilt.current
      if (!id) {
        const res = await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description: "Saved from a place" }),
        })
        if (!res.ok) throw new Error("Couldn't create that trip")
        const { collection } = (await res.json()) as { collection: { id: string } }
        id = collection.id
        halfBuilt.current = id
      }
      await postPlace(id)
      halfBuilt.current = null
      added(id, name)
    } catch {
      notify.error(
        halfBuilt.current ? `${name} was created, but this place didn't save to it.` : "Couldn't create that trip. Try again in a moment.",
        halfBuilt.current ? { description: "Try again to add it — you won't get a second copy." } : undefined
      )
      // The half-built trip is real; refresh so it shows up in the menu.
      if (halfBuilt.current) onChanged()
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
