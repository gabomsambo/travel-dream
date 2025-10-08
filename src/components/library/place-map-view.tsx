"use client"

import dynamic from 'next/dynamic'
import type { Place } from "@/types/database"

const PlaceMapInternal = dynamic(() => import('./place-map-internal'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] bg-muted rounded-lg flex items-center justify-center">
      <p className="text-muted-foreground">Loading map...</p>
    </div>
  ),
})

interface PlaceMapViewProps {
  places: Place[]
  onView: (place: Place) => void
}

export function PlaceMapView({ places, onView }: PlaceMapViewProps) {
  return <PlaceMapInternal places={places} onView={onView} />
}
