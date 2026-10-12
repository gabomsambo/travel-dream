"use client"

import Link from "next/link"
import { Trash2, RotateCcw } from "lucide-react"
import { CoverPhotoCredit } from "@/components/attribution/cover-photo-credit"
import { FallbackArt } from "@/components/explore/fallback-art"
import { kindLabel } from "@/components/explore/kind-icon"
import { SelectMark } from "@/components/library/library-place-menu"
import { locationLine, setAsideLine, type ArchivePlace } from "@/lib/archive/view"
import { cn } from "@/lib/utils"

export function ArchiveList({
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
    <ul className="divide-y">
      {places.map((place) => {
        const where = locationLine(place.city, place.country)
        const checked = selected.has(place.id)
        return (
          <li key={place.id}>
            <article
              className={cn(
                "flex flex-col gap-3 px-1 py-3 sm:flex-row sm:items-center sm:gap-4",
                checked && "bg-primary/5"
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <SelectMark
                  checked={checked}
                  label={`Select ${place.name}`}
                  onToggle={() => onToggle(place.id)}
                  tone="plain"
                />
                <Link
                  href={`/place/${place.id}`}
                  data-place-id={place.id}
                  aria-label={`Open ${place.name}`}
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {place.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={place.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <FallbackArt name={place.name} kind={place.kind} />
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/place/${place.id}`}
                    className="block truncate font-medium outline-none hover:underline focus-visible:underline"
                  >
                    {place.name}
                  </Link>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {[where, kindLabel(place.kind)].filter(Boolean).join(" · ")}
                  </p>
                  {place.coverUrl && (
                    <CoverPhotoCredit
                      attribution={place.coverAttribution}
                      source={place.coverSource}
                      variant="inline"
                      className="mt-1"
                    />
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {setAsideLine(place.archivedAt, place.createdAt)}
                  </p>
                  {place.trips.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {place.trips.map((trip) => (
                        <Link
                          key={trip.id}
                          href={`/collections/${trip.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Still on {trip.name}
                        </Link>
                      ))}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pl-9 sm:pl-0">
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
            </article>
          </li>
        )
      })}
    </ul>
  )
}
