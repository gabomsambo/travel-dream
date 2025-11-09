"use client"

import { Card } from "@/components/ui/card"
import { MapPin } from "lucide-react"
import type { Place } from "@/types/database"
import { cn } from "@/lib/utils"

interface DayMapProps {
  places: Place[]
  dayNumber?: number
  hoveredPlaceId?: string | null
  onPlaceHover?: (placeId: string | null) => void
  transportMode: 'drive' | 'walk'
}

export function DayMap({
  places,
  dayNumber,
  hoveredPlaceId,
  onPlaceHover,
}: DayMapProps) {
  const placesWithCoords = places.filter((p) => p.coords)

  if (placesWithCoords.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center bg-muted/20 sticky top-20">
        <div className="text-center space-y-2 p-8">
          <MapPin className="h-12 w-12 text-muted-foreground/50 mx-auto" />
          <div className="space-y-1">
            <h3 className="font-semibold">No places to show</h3>
            <p className="text-sm text-muted-foreground">
              {dayNumber ? `Add places to Day ${dayNumber} to see the route` : 'Select a day to view its route'}
            </p>
          </div>
        </div>
      </Card>
    )
  }

  const lats = placesWithCoords.map((p) => p.coords!.lat)
  const lngs = placesWithCoords.map((p) => p.coords!.lon)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const latPadding = (maxLat - minLat) * 0.2 || 0.1
  const lngPadding = (maxLng - minLng) * 0.2 || 0.1

  const bounds = {
    minLat: minLat - latPadding,
    maxLat: maxLat + latPadding,
    minLng: minLng - lngPadding,
    maxLng: maxLng + lngPadding,
  }

  const projectPoint = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100
    return { x, y }
  }

  const projectedPlaces = placesWithCoords.map((place, index) => {
    const point = projectPoint(place.coords!.lat, place.coords!.lon)
    return { ...place, x: point.x, y: point.y, order: index + 1 }
  })

  const pathData = projectedPlaces
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ')

  return (
    <Card className="h-[500px] overflow-hidden sticky top-20">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Day {dayNumber} Route</h3>
        <p className="text-xs text-muted-foreground">{placesWithCoords.length} stops</p>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-full">
        <path
          d={pathData}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="0.5"
          strokeDasharray="1,1"
          opacity="0.5"
        />

        {projectedPlaces.map((place) => (
          <g
            key={place.id}
            transform={`translate(${place.x}, ${place.y})`}
            className={cn(
              "cursor-pointer transition-all",
              hoveredPlaceId === place.id && "scale-125"
            )}
            onMouseEnter={() => onPlaceHover?.(place.id)}
            onMouseLeave={() => onPlaceHover?.(null)}
          >
            <circle
              r="2"
              fill="hsl(var(--primary))"
              stroke="white"
              strokeWidth="0.5"
            />
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[3px] fill-white font-bold"
            >
              {place.order}
            </text>
          </g>
        ))}
      </svg>
    </Card>
  )
}
