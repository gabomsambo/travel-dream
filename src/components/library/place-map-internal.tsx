"use client"

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import type { Place } from "@/types/database"
import L from 'leaflet'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface PlaceMapInternalProps {
  places: Place[]
  onView: (place: Place) => void
}

export default function PlaceMapInternal({ places, onView }: PlaceMapInternalProps) {
  const placesWithCoords = places.filter(
    (p) => p.coords && typeof p.coords === 'object' && 'lat' in p.coords && 'lon' in p.coords
  )

  const center: [number, number] =
    placesWithCoords.length > 0 && placesWithCoords[0].coords
      ? [
          (placesWithCoords[0].coords as { lat: number; lon: number }).lat,
          (placesWithCoords[0].coords as { lat: number; lon: number }).lon,
        ]
      : [0, 0]

  const zoom = placesWithCoords.length > 0 ? 12 : 2

  if (placesWithCoords.length === 0) {
    return (
      <div className="w-full h-[600px] bg-muted rounded-lg flex items-center justify-center">
        <p className="text-muted-foreground">
          No places with coordinates to display on the map
        </p>
      </div>
    )
  }

  return (
    <div className="w-full h-[600px] rounded-lg overflow-hidden border">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MarkerClusterGroup maxClusterRadius={80}>
          {placesWithCoords.map((place) => {
            const coords = place.coords as { lat: number; lon: number }
            return (
              <Marker key={place.id} position={[coords.lat, coords.lon]}>
                <Popup>
                  <div className="p-2 min-w-[200px]">
                    <h3 className="font-semibold mb-1">{place.name}</h3>
                    <Badge variant="secondary" className="text-xs mb-2">
                      {place.kind}
                    </Badge>
                    <p className="text-sm text-muted-foreground mb-2">
                      {[place.city, place.country].filter(Boolean).join(', ')}
                    </p>
                    <Button size="sm" onClick={() => onView(place)} className="w-full">
                      View Details
                    </Button>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  )
}
