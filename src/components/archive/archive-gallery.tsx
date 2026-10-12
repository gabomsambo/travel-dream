"use client"

import { useRouter } from "next/navigation"
import { PlaceCardV2 } from "@/components/library-v2/place-card-v2"
import { SelectMark } from "@/components/library/library-place-menu"
import type { ArchivePlace } from "@/lib/archive/view"
import { cn } from "@/lib/utils"

export function ArchiveGallery({
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
  const router = useRouter()
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {places.map((place) => (
        <div key={place.id} className="relative">
          <div className="absolute left-2 top-2 z-10">
            <SelectMark
              checked={selected.has(place.id)}
              label={`Select ${place.name}`}
              onToggle={() => onToggle(place.id)}
            />
          </div>
          <PlaceCardV2
            place={{
              id: place.id,
              userId: null,
              name: place.name,
              kind: place.kind,
              city: place.city,
              country: place.country,
              description: place.description,
              tags: place.tags,
              vibes: place.vibes,
              ratingSelf: place.ratingSelf,
              notes: place.notes,
              status: place.status,
              price_level: place.priceLevel,
              visitStatus: place.visitStatus,
              priority: null,
              address: null,
              altNames: [],
              cuisine: [],
              activities: [],
              amenities: [],
              practicalInfo: null,
              createdAt: place.createdAt,
              updatedAt: place.createdAt,
              archivedAt: place.archivedAt,
              coverUrl: place.coverUrl ?? undefined,
              coverAttribution: place.coverAttribution,
              coverSource: place.coverSource,
            }}
            trips={place.trips}
            onClick={() => router.push(`/place/${place.id}`)}
            onRestore={() => onRestore(place.id)}
            onDelete={() => onDelete(place.id)}
            className={cn(selected.has(place.id) && "ring-2 ring-primary")}
          />
        </div>
      ))}
    </div>
  )
}
