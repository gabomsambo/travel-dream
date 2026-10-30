"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, FolderPlus, Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Photo } from "@/components/photo"
import { notify } from "@/lib/notify"
import { normalize } from "@/lib/library/search"
import type { ExploreCollection } from "@/lib/explore/types"
import type { LibraryItem } from "@/lib/library/types"
import { LibrarySheet } from "./library-sheet"
import { useLibrarySync } from "./library-sync"

/** The add-places route takes at most this many ids per request. */
const ADD_BATCH = 100

// A collection is created before its places go in, so a failed add leaves a
// real collection behind. Remembered per selected places — shared by every
// chooser on the page and across reopenings — so a retry fills that one
// instead of creating a second. Toasts use the name saved at create, or the
// collection row once a refresh has it; editing the field does not rename it.
// Dropped as deleted only once the list has shown it and then lost it —
// before the refresh lands, a missing collection just means "not shown yet".
type HalfBuiltEntry = { id: string; name: string; seen: boolean; added: Set<string> }

/** Keyed by the selected place ids so a retry reuses the collection even if the name changed. */
const halfBuiltByPlaces = new Map<string, HalfBuiltEntry>()

function placesSelectionKey(placeIds: string[]): string {
  return placeIds.join("\u0000")
}

export function resetHalfBuiltCollectionsForTests() {
  halfBuiltByPlaces.clear()
}

/**
 * Places from this selection still missing. Once the collection is in the
 * snapshot, only that row's place ids count — a later undo or removal puts
 * those places back in the batch. Until the row shows up, places recorded on
 * this attempt stand in for the snapshot.
 */
export function freshPlacesForHalfBuilt(
  collectionId: string,
  placeIds: string[],
  collections: ExploreCollection[],
  entry: HalfBuiltEntry | undefined
): string[] {
  const row = collections.find((c) => c.id === collectionId)
  const members = new Set(row ? row.placeIds : [...(entry?.added ?? [])])
  return placeIds.filter((id) => !members.has(id))
}

/** Name to announce: the refreshed row when we have it, otherwise the name saved at create. */
function storedCollectionName(collectionId: string, collections: ExploreCollection[], savedName: string): string {
  return collections.find((c) => c.id === collectionId)?.name ?? savedName
}

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; body: T | null }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${url} failed (${res.status})`)
  return { status: res.status, body: (await res.json().catch(() => null)) as T | null }
}

/** Adds in batches. Returns the ids that landed and how many did not. */
async function addPlaces(
  collectionId: string,
  placeIds: string[]
): Promise<{ added: string[]; failed: number }> {
  const added: string[] = []
  for (let i = 0; i < placeIds.length; i += ADD_BATCH) {
    const part = placeIds.slice(i, i + ADD_BATCH)
    try {
      const { body } = await postJson<{ results?: { successful?: string[]; failed?: Array<{ placeId: string }> } }>(
        `/api/collections/${collectionId}/places`,
        { placeIds: part }
      )
      const failedIds = new Set((body?.results?.failed ?? []).map((f) => f.placeId))
      added.push(...(body?.results?.successful ?? part.filter((id) => !failedIds.has(id))))
    } catch (err) {
      if (!added.length) throw err
      return { added, failed: placeIds.length - added.length }
    }
  }
  return { added, failed: placeIds.length - added.length }
}

async function removePlaces(collectionId: string, placeIds: string[]): Promise<number> {
  let failed = 0
  for (const id of placeIds) {
    const res = await fetch(`/api/collections/${collectionId}/places/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null)
    if (!res?.ok) failed++
  }
  return failed
}

/** "Lisbon trip" when the places share a city, "Japan trip" a country, else "New trip · Oct 2026". */
export function suggestCollectionName(items: Pick<LibraryItem, "city" | "country">[], now = new Date()): string {
  const one = (values: Array<string | null>) => {
    const set = new Set(values.map((v) => v?.trim()).filter(Boolean))
    return set.size === 1 ? [...set][0]! : null
  }
  const city = one(items.map((p) => p.city))
  if (city) return `${city} trip`
  const country = one(items.map((p) => p.country))
  if (country) return `${country} trip`
  return `New trip · ${now.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
}

function Collage({ photos }: { photos: string[] }) {
  return (
    <span className="grid h-11 w-14 shrink-0 grid-cols-[2fr_1fr] grid-rows-2 gap-px overflow-hidden rounded-lg bg-muted">
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("relative bg-muted-foreground/10", i === 0 && "row-span-2")}>
          {photos[i] && (
            <Photo src={photos[i]} use="thumb" sizes={i === 0 ? "38px" : "19px"} />
          )}
        </span>
      ))}
    </span>
  )
}

/**
 * The one "Add to collection" chooser, for one place or a hundred: search your
 * collections, see which already hold some of them, or name a new one inline.
 * Undo removes only the places this add put in.
 */
export function AddToCollectionDialog({
  placeIds,
  onOpenChange,
  collections,
  byId,
  onDone,
}: {
  /** Null when closed. */
  placeIds: string[] | null
  onOpenChange: (open: boolean) => void
  collections: ExploreCollection[]
  byId: Map<string, LibraryItem>
  onDone: () => void
}) {
  const router = useRouter()
  const sync = useLibrarySync()
  const open = placeIds !== null
  const ids = React.useMemo(() => placeIds ?? [], [placeIds])
  const items = React.useMemo(() => ids.map((id) => byId.get(id)).filter((p): p is LibraryItem => !!p), [ids, byId])
  const [q, setQ] = React.useState("")
  const [newName, setNewName] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const newRef = React.useRef<HTMLInputElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    for (const entry of halfBuiltByPlaces.values()) if (collections.some((c) => c.id === entry.id)) entry.seen = true
  }, [collections])

  React.useEffect(() => {
    if (open) {
      setQ("")
      setNewName(suggestCollectionName(items))
    }
    // Only when it opens: the suggestion must not overwrite what the user typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const needle = normalize(q)
  const rows = React.useMemo(
    () =>
      collections
        .map((c) => {
          const members = new Set(c.placeIds)
          return {
            c,
            have: ids.filter((id) => members.has(id)).length,
            photos: c.placeIds.map((id) => byId.get(id)?.photos[0]?.thumb).filter((s): s is string => !!s).slice(0, 3),
          }
        })
        .filter((r) => !needle || normalize(r.c.name).includes(needle)),
    [collections, ids, byId, needle]
  )

  const undo = (collectionId: string, name: string, added: string[]) => async () => {
    const failed = await removePlaces(collectionId, added)
    if (failed) notify.error(`Couldn't take ${failed} back out of ${name}.`)
    else notify.success(`Removed ${added.length} from ${name}`)
    // Which ones stayed is not known when some failed; the library says.
    if (failed) sync.revalidate()
    else sync.apply({ kind: "members", id: collectionId, remove: added })
  }

  const finish = (collectionId: string, name: string, added: string[], already: number, failed: number) => {
    const parts = [`${added.length} added`, already ? `${already} ${already === 1 ? "was" : "were"} already there` : null, failed ? `${failed} couldn't be added` : null].filter(Boolean)
    const message = added.length ? `Added ${added.length} to ${name}` : `Nothing new for ${name}`
    const description = parts.join(" · ")
    const opts = {
      description,
      action: { label: "Open", onClick: () => router.push(`/collections/${collectionId}/planner`) },
      ...(added.length ? { cancel: { label: "Undo", onClick: () => void undo(collectionId, name, added)() } } : {}),
    }
    if (failed) notify.warning(message, opts)
    else notify.success(message, { ...opts, duration: 8_000 })
    onDone()
    onOpenChange(false)
  }

  const addToExisting = async (c: ExploreCollection) => {
    const members = new Set(c.placeIds)
    const fresh = ids.filter((id) => !members.has(id))
    if (!fresh.length) {
      notify.info(`${ids.length === 1 ? "It's" : "They're all"} already in ${c.name}`)
      return
    }
    setBusy(c.id)
    try {
      const { added, failed } = await addPlaces(c.id, fresh)
      sync.apply({ kind: "members", id: c.id, add: added })
      finish(c.id, c.name, added, ids.length - fresh.length, failed)
    } catch {
      notify.error(`Couldn't add to ${c.name}. Try again in a moment.`)
      sync.revalidate()
    } finally {
      setBusy(null)
    }
  }

  const createAndAdd = async () => {
    const name = newName.trim()
    if (!name || !ids.length) return
    const selectionKey = placesSelectionKey(ids)
    setBusy("new")
    try {
      let entry = halfBuiltByPlaces.get(selectionKey)
      let id = entry?.id
      const shown = entry
      if (shown?.seen && !collections.some((c) => c.id === shown.id)) {
        // The list showed it, then lost it: it was deleted, so start over.
        halfBuiltByPlaces.delete(selectionKey)
        entry = undefined
        id = undefined
      }
      if (!id) {
        const { body } = await postJson<{ collection: { id: string } }>("/api/collections", { name, description: null })
        if (!body?.collection?.id) throw new Error("No collection id")
        id = body.collection.id
        entry = { id, name, seen: false, added: new Set() }
        halfBuiltByPlaces.set(selectionKey, entry)
      }
      if (!entry) throw new Error("No collection id")
      const fresh = freshPlacesForHalfBuilt(id, ids, collections, entry)
      const { added, failed } = await addPlaces(id, fresh)
      for (const placeId of added) entry.added.add(placeId)
      const remaining = freshPlacesForHalfBuilt(id, ids, collections, entry)
      if (failed === 0 && remaining.length === 0) halfBuiltByPlaces.delete(selectionKey)
      const already = ids.length - fresh.length
      const collectionId = id
      // The collection exists on the server from here on, whatever happens to its places.
      if (!collections.some((c) => c.id === collectionId)) sync.apply({ kind: "collection", collection: { id: collectionId, name: entry.name, description: null, placeIds: [] } })
      sync.apply({ kind: "members", id: collectionId, add: added })
      finish(id, storedCollectionName(id, collections, entry.name), added, already, failed)
    } catch {
      const orphan = halfBuiltByPlaces.get(selectionKey)
      const label = orphan ? storedCollectionName(orphan.id, collections, orphan.name) : name
      notify.error(
        orphan ? `${label} was created, but the places didn't save to it.` : "Couldn't create that collection. Try again in a moment.",
        orphan ? { description: "Press Create again to fill it — you won't get a second copy." } : undefined
      )
      if (orphan) sync.revalidate()
    } finally {
      setBusy(null)
    }
  }

  const count = ids.length
  return (
    <LibrarySheet
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={`Add ${count === 1 ? (items[0]?.name ?? "1 place") : `${count} places`} to a collection`}
      description="Pick a trip or list, or start a new one."
      initialFocus={collections.length > 5 ? searchRef : newRef}
    >
      <div className="px-5 pb-5">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void createAndAdd()
          }}
          className="flex items-center gap-2 rounded-2xl border border-dashed p-2 pl-3"
        >
          <FolderPlus className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <label htmlFor="library-new-collection" className="sr-only">
            New collection name
          </label>
          <input
            id="library-new-collection"
            ref={newRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={200}
            placeholder="New collection name"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <button type="submit" disabled={!newName.trim() || busy !== null} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-semibold text-background disabled:opacity-50">
            {busy === "new" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create
          </button>
        </form>

        {collections.length > 0 && (
          <>
            {collections.length > 5 && (
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  ref={searchRef}
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Find a collection…"
                  aria-label="Find a collection"
                  className="h-10 w-full rounded-xl border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
                />
              </div>
            )}
            <p className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your collections</p>
            <ul className="-mx-2">
              {rows.map(({ c, have, photos }) => {
                const all = have === count && count > 0
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void addToExisting(c)}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition hover:bg-secondary focus-visible:bg-secondary disabled:opacity-60"
                    >
                      <Collage photos={photos} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.placeIds.length} {c.placeIds.length === 1 ? "place" : "places"}
                          {have > 0 && !all && ` · has ${have} of these`}
                        </span>
                      </span>
                      {busy === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : all ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Check className="h-3.5 w-3.5" /> Already in
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-primary">Add</span>
                      )}
                    </button>
                  </li>
                )
              })}
              {!rows.length && <li className="px-2 py-3 text-sm text-muted-foreground">No collection matches “{q}”.</li>}
            </ul>
          </>
        )}
      </div>
    </LibrarySheet>
  )
}
