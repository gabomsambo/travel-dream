"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { notify } from "@/lib/notify"
import type { ExploreCollection, ExplorePlace } from "@/lib/explore/types"
import { PlaceSheet } from "./place-sheet"

export interface NewCollection {
  name: string
  placeIds: string[]
  description?: string
  /** Trips land in the day planner; a saved rail lands on the collection itself. */
  landing: "planner" | "collection"
}

interface ExploreContextValue {
  places: Map<string, ExplorePlace>
  collections: ExploreCollection[]
  /** Opens the quick-look sheet. `siblings` lets the sheet page left/right through a rail. */
  openPlace: (id: string, siblings?: string[]) => void
  /**
   * Resolves false when the save did not finish, so a dialog can stay open. A
   * retry after a failed add finishes the collection already created rather than
   * making a second one.
   */
  createCollection: (input: NewCollection) => Promise<boolean>
  addToTrip: (collectionId: string, placeIds: string[]) => Promise<void>
  busy: boolean
}

const ExploreContext = React.createContext<ExploreContextValue | null>(null)

export function useExplore(): ExploreContextValue {
  const ctx = React.useContext(ExploreContext)
  if (!ctx) throw new Error("useExplore must be used inside <ExploreProvider>")
  return ctx
}

/** The add-places route accepts at most this many ids per request. */
const ADD_BATCH = 100

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${url} failed (${res.status})`)
  return res.json() as Promise<T>
}

/** Adds places in batches; returns how many the server reported as failed. */
async function addPlaces(collectionId: string, placeIds: string[]): Promise<number> {
  let failed = 0
  for (let i = 0; i < placeIds.length; i += ADD_BATCH) {
    const res = await postJson<{ results?: { failed?: unknown[] } }>(`/api/collections/${collectionId}/places`, {
      placeIds: placeIds.slice(i, i + ADD_BATCH),
    })
    failed += res.results?.failed?.length ?? 0
  }
  return failed
}

export function ExploreProvider({
  places,
  collections,
  children,
}: {
  places: ExplorePlace[]
  collections: ExploreCollection[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const byId = React.useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const [open, setOpen] = React.useState<{ id: string; siblings: string[] } | null>(null)
  const [busy, setBusy] = React.useState(false)
  // A collection is created before its places go in, so a failed add leaves a
  // real — and empty — collection behind. Keyed by what the user asked for, the
  // id lets a retry finish that same collection instead of creating a second
  // copy under the same name. Cleared once the collection is complete.
  const halfBuilt = React.useRef(new Map<string, string>())

  const openPlace = React.useCallback((id: string, siblings: string[] = []) => setOpen({ id, siblings }), [])

  // A trip is an ordinary collection: create it, fill it, then open it. Uses the
  // existing collection APIs, so ownership checks stay where they already are.
  const createCollection = React.useCallback(
    async ({ name, placeIds, description, landing }: NewCollection) => {
      setBusy(true)
      const key = `${name}\u0000${placeIds.join(",")}`
      try {
        let id = halfBuilt.current.get(key)
        if (!id) {
          const { collection } = await postJson<{ collection: { id: string } }>("/api/collections", {
            name,
            description: description ?? "Saved from Explore",
          })
          id = collection.id
          halfBuilt.current.set(key, id)
        }
        const failed = await addPlaces(id, placeIds)
        halfBuilt.current.delete(key)
        const added = placeIds.length - failed
        const detail = failed > 0 ? `${added} of ${placeIds.length} places added.` : `${added} places added.`
        if (failed > 0) notify.warning(`${name} is missing ${failed} places`, { description: detail })
        else notify.success(`${name} is ready`, { description: landing === "planner" ? `${detail} Drag them into days.` : detail })
        setOpen(null)
        router.push(landing === "planner" ? `/collections/${id}/planner` : `/collections/${id}`)
        return true
      } catch {
        const orphan = halfBuilt.current.get(key)
        notify.error(
          orphan ? `${name} was created, but its places didn't save.` : "Couldn't create that collection. Try again in a moment.",
          orphan ? { description: "Save again to add them to it — you won't get a second copy." } : undefined
        )
        return false
      } finally {
        setBusy(false)
      }
    },
    [router]
  )

  const addToTrip = React.useCallback(
    async (collectionId: string, placeIds: string[]) => {
      setBusy(true)
      try {
        const failed = await addPlaces(collectionId, placeIds)
        const name = collections.find((c) => c.id === collectionId)?.name ?? "your trip"
        if (failed > 0) {
          notify.warning(`Added ${placeIds.length - failed} of ${placeIds.length} to ${name}`)
        } else {
          notify.success(`Added to ${name}`, {
            action: { label: "Open", onClick: () => router.push(`/collections/${collectionId}/planner`) },
          })
        }
        router.refresh()
      } catch {
        notify.error("Couldn't add to that trip.")
      } finally {
        setBusy(false)
      }
    },
    [collections, router]
  )

  const value = React.useMemo(
    () => ({ places: byId, collections, openPlace, createCollection, addToTrip, busy }),
    [byId, collections, openPlace, createCollection, addToTrip, busy]
  )

  return (
    <ExploreContext.Provider value={value}>
      {children}
      <PlaceSheet
        state={open}
        onNavigate={(id) => setOpen((s) => (s ? { ...s, id } : s))}
        onClose={() => setOpen(null)}
      />
    </ExploreContext.Provider>
  )
}
