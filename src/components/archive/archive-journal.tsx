"use client"

import Link from "next/link"
import { Heart, RotateCcw, Trash2 } from "lucide-react"
import { FallbackArt } from "@/components/explore/fallback-art"
import { kindLabel } from "@/components/explore/kind-icon"
import { FindImageButton } from "@/components/places/find-image-button"
import { SelectMark } from "@/components/library/library-place-menu"
import { flagFor } from "@/lib/explore/geo"
import { locationLine, setAsideLine, type ArchivePlace } from "@/lib/archive/view"
import { FavoriteManager } from "@/lib/place-card-helpers"
import { cn } from "@/lib/utils"
import * as React from "react"

/** Library's journal, scoped to archived rows: photo, serif name, the note you wrote. */
export function ArchiveJournal({
  places,
  selected,
  onToggle,
  onRestore,
  onDelete,
}: {
  places: ArchivePlace[]
  selected: Set<string>
  onToggle: (id: string) => void
  onRestore: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="max-w-[980px]">
      {places.map((place) => {
        const where = locationLine(place.city, place.country)
        const checked = selected.has(place.id)
        const flag = flagFor(place.country)
        return (
          <article
            key={place.id}
            className={cn(
              "grid grid-cols-[96px_minmax(0,1fr)] gap-4 border-b py-4 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-5",
              checked && "bg-primary/5"
            )}
          >
            <Link
              href={`/place/${place.id}`}
              aria-label={`Open ${place.name}`}
              className="group relative aspect-square overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring sm:aspect-[4/3] sm:rounded-2xl"
            >
              {place.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={place.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
              ) : (
                <FallbackArt name={place.name} kind={place.kind} />
              )}
            </Link>
            <div className="min-w-0 sm:pt-1">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {flag && <span className="mr-1">{flag}</span>}
                  {where || "Somewhere"} · {kindLabel(place.kind)}
                </p>
                <SelectMark
                  checked={checked}
                  label={`Select ${place.name}`}
                  onToggle={() => onToggle(place.id)}
                  tone="plain"
                />
                <JournalHeart id={place.id} name={place.name} />
                {!place.coverUrl && (
                  <FindImageButton
                    placeId={place.id}
                    placeName={place.name}
                    placeCity={place.city}
                    hasGooglePlaceId={false}
                    variant="icon-only"
                    onAttached={() => window.location.reload()}
                  />
                )}
              </div>
              <h3>
                <Link
                  href={`/place/${place.id}`}
                  data-place-id={place.id}
                  className="mt-1 block font-editorial text-[28px] leading-none outline-none hover:underline focus-visible:underline sm:text-[38px]"
                >
                  {place.name}
                </Link>
              </h3>
              {place.notes?.trim() ? (
                <blockquote className="mt-2.5 border-l-2 border-primary pl-3.5 font-editorial text-lg italic leading-tight sm:text-[21px]">
                  “{place.notes.trim()}”
                </blockquote>
              ) : place.description ? (
                <p className="mt-2 line-clamp-3 max-w-[560px] text-sm text-muted-foreground">{place.description}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <span>{setAsideLine(place.archivedAt, place.createdAt)}</span>
                {place.trips.map((trip) => (
                  <Link key={trip.id} href={`/collections/${trip.id}`} className="font-medium text-primary hover:underline">
                    Still on {trip.name}
                  </Link>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => onRestore(place.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium hover:bg-secondary"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(place.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function JournalHeart({ id, name }: { id: string; name: string }) {
  const [on, setOn] = React.useState(false)
  React.useEffect(() => setOn(FavoriteManager.isFavorited(id)), [id])
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove heart from ${name}` : `Heart ${name}`}
      onClick={() => {
        FavoriteManager.toggleFavorite(id)
        setOn(FavoriteManager.isFavorited(id))
      }}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-foreground outline-none hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Heart className={cn("h-3.5 w-3.5", on && "fill-rose-500 text-rose-500")} />
    </button>
  )
}
