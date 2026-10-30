"use client"

import * as React from "react"
import Link from "next/link"
// Raw Radix on purpose: the quick-look sheet is an edge-to-edge media sheet with
// its own overlay and close button, which the ui/ and ui-v2/ DialogContent cannot
// express — both hard-code a centred, padded, portal-and-overlay dialog that also
// renders a second close button.
import * as Dialog from "@radix-ui/react-dialog"
import { ArrowUpRight, ChevronLeft, ChevronRight, Clock, Plus, Sparkles, UserRound, X, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { citiesMatchInCountry, cityGroupLabel } from "@/lib/city-names"
import { Button } from "@/components/adapters/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/adapters/dropdown-menu"
import { flagFor, slugify } from "@/lib/explore/geo"
import type { ExplorePhoto, ExplorePlace } from "@/lib/explore/types"
import { savedAgoLabel } from "@/lib/explore/rails"
import { useExplore } from "./explore-provider"
import { editorialFont } from "./fonts"
import { FallbackArt } from "./fallback-art"
import { Photo } from "@/components/photo"
import { kindIcon, kindLabel } from "./kind-icon"

interface SheetState {
  id: string
  siblings: string[]
}

/**
 * The neighbours the server found for a place, keyed by place id. A place the
 * page does not hold can still be opened from here, so they resolve too.
 */
function useRemoteSameCity(placeId: string | undefined, enabled: boolean) {
  const [byPlace, setByPlace] = React.useState<Record<string, ExplorePlace[]>>({})
  const have = placeId !== undefined && byPlace[placeId] !== undefined

  React.useEffect(() => {
    if (!enabled || !placeId || have) return
    const controller = new AbortController()
    fetch(`/api/explore/same-city/${encodeURIComponent(placeId)}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ places?: ExplorePlace[] }>) : null))
      .then((body) => {
        if (body && Array.isArray(body.places)) setByPlace((prev) => ({ ...prev, [placeId]: body.places! }))
      })
      .catch(() => {
        // The rail is a nicety: a failed lookup leaves it out, and the next open asks again.
      })
    return () => controller.abort()
  }, [enabled, placeId, have])

  return byPlace
}

/** Cache key for a place's photo set as the index describes it (count + cover). */
function placePhotosCacheKey(place: ExplorePlace): string {
  const count = place.photoCount ?? place.photos.length
  return `${place.id}:${count}:${place.photos[0]?.uri ?? ""}`
}

/**
 * A place's photos for the sheet. A place that carries only its first photo
 * (the Library's index does, with a count) asks the server for the rest when it
 * is opened; until they arrive the sheet keeps whatever richer list it already
 * held rather than shrinking to the slim wire photo.
 */
function usePlacePhotos(place: ExplorePlace | undefined): ExplorePhoto[] {
  const [byKey, setByKey] = React.useState<Record<string, ExplorePhoto[]>>({})
  const richer = React.useRef<{ key: string; photos: ExplorePhoto[] } | null>(null)
  const id = place?.id
  const key = place ? placePhotosCacheKey(place) : undefined
  const wire = place?.photos ?? []
  const wanted = place !== undefined && (place.photoCount ?? place.photos.length) > place.photos.length
  const heldFloor =
    key !== undefined && richer.current?.key === key ? richer.current.photos.length : 0
  const floor = Math.max(wire.length, heldFloor)
  const cached = key !== undefined ? byKey[key] : undefined
  const usable = cached !== undefined && cached.length >= floor
  const shortCached = cached !== undefined && !usable

  React.useEffect(() => {
    if (!key || !shortCached) return
    setByKey((prev) => {
      if (prev[key] === undefined) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [key, shortCached])

  React.useEffect(() => {
    if (!id || !key || !wanted || usable || shortCached) return
    const controller = new AbortController()
    const requestKey = key
    const minLength = floor
    fetch(`/api/library/photos/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ photos?: ExplorePhoto[] }>) : null))
      .then((body) => {
        if (!body || !Array.isArray(body.photos)) return
        const stillHeld =
          richer.current?.key === requestKey ? richer.current.photos.length : 0
        if (body.photos.length < Math.max(minLength, stillHeld)) return
        setByKey((prev) => ({ ...prev, [requestKey]: body.photos }))
      })
      .catch(() => {
        // The first photo is already showing; the next open asks again.
      })
    return () => controller.abort()
  }, [id, key, wanted, usable, shortCached, floor])

  if (!key) return wire

  if (usable) {
    richer.current = { key, photos: cached }
    return cached
  }

  const prev = richer.current
  if (!prev || prev.key !== key || wire.length >= prev.photos.length) {
    richer.current = { key, photos: wire }
  }
  if (wanted && richer.current.key === key && richer.current.photos.length > wire.length) {
    return richer.current.photos
  }
  return wire
}

export function PlaceSheet({
  state,
  sameCity: sameCityMode,
  onNavigate,
  onClose,
}: {
  state: SheetState | null
  sameCity: "local" | "fetch"
  onNavigate: (id: string) => void
  onClose: () => void
}) {
  const { places, collections, createCollection, addToTrip, busy, openPlace } = useExplore()
  // A place on the page with no city has no neighbours to look up. One that is
  // not on the page was itself a neighbour, so it has a city.
  const held = state ? places.get(state.id) : undefined
  const remote = useRemoteSameCity(state?.id, sameCityMode === "fetch" && (!held || !!held.city))
  // A neighbour opened from "Also in" is not on the page, only in the lookup.
  const known = React.useMemo(() => {
    if (sameCityMode !== "fetch") return places
    const all = new Map(places)
    for (const list of Object.values(remote)) for (const p of list) if (!all.has(p.id)) all.set(p.id, p)
    return all
  }, [places, remote, sameCityMode])
  const place = state ? known.get(state.id) : undefined
  const photos = usePlacePhotos(place)
  const [photo, setPhoto] = React.useState(0)

  React.useEffect(() => setPhoto(0), [state?.id])

  const idx = state && place ? state.siblings.indexOf(place.id) : -1
  const prevId = idx > 0 ? state!.siblings[idx - 1] : null
  const nextId = idx >= 0 && idx < (state?.siblings.length ?? 0) - 1 ? state!.siblings[idx + 1] : null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" && prevId) onNavigate(prevId)
    if (e.key === "ArrowRight" && nextId) onNavigate(nextId)
  }

  const sameCity = React.useMemo(() => {
    if (!place?.city) return []
    if (sameCityMode === "fetch") return remote[place.id] ?? []
    return [...places.values()].filter((p) => citiesMatchInCountry(p, place) && p.id !== place.id).slice(0, 6)
  }, [place, places, remote, sameCityMode])

  const Icon = place ? kindIcon(place.kind) : null
  const inCollections = place ? collections.filter((c) => c.placeIds.includes(place.id)) : []

  return (
    <Dialog.Root open={!!place} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          onKeyDown={onKeyDown}
          className={cn(
            editorialFont.variable,
            "fixed z-[70] flex flex-col overflow-hidden bg-background text-foreground shadow-2xl outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl",
            "md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(640px,88vh)] md:w-[min(1040px,94vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:flex-row md:rounded-3xl",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 md:data-[state=open]:zoom-in-95 md:data-[state=open]:slide-in-from-bottom-0"
          )}
        >
          {place && Icon && (
            <>
              {/* Photo side */}
              <div className="relative h-[42dvh] shrink-0 bg-muted md:h-auto md:w-[56%]">
                {photos.length ? (
                  <Photo
                    key={photos[photo].uri}
                    src={photos[photo].uri}
                    alt={place.name}
                    sizes="(min-width: 768px) 580px, 100vw"
                    className="animate-in fade-in-0 duration-500"
                  />
                ) : (
                  <FallbackArt name={place.name} kind={place.kind} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
                {photos.length > 1 && (
                  <>
                    <div className="absolute inset-x-4 top-4 flex gap-1.5">
                      {photos.map((_, i) => (
                        <button
                          key={i}
                          aria-label={`Photo ${i + 1}`}
                          onClick={() => setPhoto(i)}
                          className={cn("h-1 flex-1 rounded-full transition-colors", i === photo ? "bg-white" : "bg-white/40 hover:bg-white/70")}
                        />
                      ))}
                    </div>
                    <button
                      aria-label="Previous photo"
                      className="absolute inset-y-0 left-0 w-1/3"
                      onClick={() => setPhoto((p) => (p - 1 + photos.length) % photos.length)}
                    />
                    <button
                      aria-label="Next photo"
                      className="absolute inset-y-0 right-0 w-1/3"
                      onClick={() => setPhoto((p) => (p + 1) % photos.length)}
                    />
                  </>
                )}
                {(prevId || nextId) && (
                  <div className="absolute bottom-4 left-4 flex gap-2">
                    <button
                      disabled={!prevId}
                      onClick={() => prevId && onNavigate(prevId)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 disabled:opacity-30"
                      aria-label="Previous place"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      disabled={!nextId}
                      onClick={() => nextId && onNavigate(nextId)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 disabled:opacity-30"
                      aria-label="Next place"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <span className="self-center pl-1 text-xs font-medium text-white/80">
                      {idx + 1} / {state!.siblings.length}
                    </span>
                  </div>
                )}
              </div>

              {/* Story side */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex-1 space-y-5 overflow-y-auto p-6 md:p-8">
                  <div className="space-y-2">
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      <span className="text-base leading-none">{flagFor(place.country)}</span>
                      {place.country ? (
                        <Link
                          href={`/explore/atlas/${slugify(place.country)}${place.city ? `/${slugify(cityGroupLabel(place.city))}` : ""}`}
                          className="rounded underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          {[place.city, place.country].filter(Boolean).join(" · ")}
                        </Link>
                      ) : (
                        <span>{place.city || "Somewhere"}</span>
                      )}
                    </p>
                    <Dialog.Title className="font-editorial text-4xl leading-[1.05] tracking-tight md:text-5xl">{place.name}</Dialog.Title>
                    <Dialog.Description className="sr-only">Saved place details</Dialog.Description>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground">
                      <Icon className="h-3.5 w-3.5" /> {kindLabel(place.kind)}
                    </span>
                    {place.priceLevel && <span className="rounded-full bg-secondary px-3 py-1 font-medium">{place.priceLevel}</span>}
                    {place.visitStatus === "visited" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 font-medium text-primary">
                        <Check className="h-3.5 w-3.5" /> Been there
                      </span>
                    )}
                    {place.priority >= 5 && place.visitStatus !== "visited" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1 font-medium text-accent-foreground dark:text-foreground">
                        <Sparkles className="h-3.5 w-3.5" /> Bucket list
                      </span>
                    )}
                  </div>

                  {(place.notes || place.description) && (
                    <blockquote className="border-l-2 border-primary/40 pl-4 font-editorial text-xl italic leading-snug text-foreground/90">
                      {place.notes || place.description}
                    </blockquote>
                  )}

                  <dl className="grid gap-3 text-sm">
                    {place.bestTimeText && (
                      <div className="flex gap-3">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div><dt className="sr-only">Best time</dt><dd><span className="text-muted-foreground">Best time · </span>{place.bestTimeText}</dd></div>
                      </div>
                    )}
                    {place.recommendedBy && (
                      <div className="flex gap-3">
                        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div><dt className="sr-only">Recommended by</dt><dd><span className="text-muted-foreground">Tip from · </span>{place.recommendedBy}</dd></div>
                      </div>
                    )}
                  </dl>

                  {place.vibes.length > 0 && (
                    <p className="text-sm text-muted-foreground">{place.vibes.map((v) => v.replace(/-/g, " ")).join("  ·  ")}</p>
                  )}

                  {sameCity.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Also in {place.city}</p>
                      <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                        {sameCity.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => openPlace(p.id, sameCity.map((s) => s.id))}
                            className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-muted text-left"
                          >
                            {p.photos[0] ? (
                              <Photo src={p.photos[0].uri} thumb={p.photos[0].thumb} use="thumb" sizes="112px" className="transition group-hover:scale-105" />
                            ) : (
                              <FallbackArt name={p.name} kind={p.kind} />
                            )}
                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 p-1.5 text-[11px] font-medium leading-tight text-white">
                              {p.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 border-t p-4 md:px-8">
                  <p className="mr-auto hidden text-xs text-muted-foreground sm:block">{savedAgoLabel(place.createdAt, new Date())}</p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={busy}>
                        <Plus className="mr-1.5 h-4 w-4" /> Add to trip
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className={cn(editorialFont.variable, "z-[80] w-60")}>
                      {inCollections.length > 0 && (
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                          Already in {inCollections.map((c) => c.name).join(", ")}
                        </DropdownMenuLabel>
                      )}
                      {collections
                        .filter((c) => !c.placeIds.includes(place.id))
                        .map((c) => (
                          <DropdownMenuItem key={c.id} onClick={() => addToTrip(c.id, [place.id])}>
                            {c.name}
                          </DropdownMenuItem>
                        ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          createCollection({
                            name: place.city ? `${place.city} trip` : `${place.name} trip`,
                            placeIds: [place.id],
                            landing: "planner",
                          })
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" /> New trip with this place
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button asChild size="sm">
                    <Link href={`/place/${place.id}`}>
                      Open place <ArrowUpRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>

              <Dialog.Close
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 md:right-5 md:top-5 md:bg-secondary md:text-foreground md:hover:bg-secondary/80"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
