"use client"

import { MapPin, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Place } from "@/types/database"

interface PlaceListViewProps {
  places: Place[]
  onView: (place: Place) => void
}

export function PlaceListView({ places, onView }: PlaceListViewProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-semibold">Name</th>
            <th className="text-left p-3 font-semibold">Location</th>
            <th className="text-left p-3 font-semibold">Kind</th>
            <th className="text-left p-3 font-semibold">Rating</th>
            <th className="text-left p-3 font-semibold">Visit Status</th>
            <th className="text-right p-3 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {places.map((place) => (
            <tr
              key={place.id}
              className="border-b hover:bg-muted/30 cursor-pointer"
              onClick={() => onView(place)}
            >
              <td className="p-3 font-medium">{place.name}</td>
              <td className="p-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[place.city, place.country].filter(Boolean).join(', ') || '-'}
                </div>
              </td>
              <td className="p-3">
                <Badge variant="secondary" className="text-xs">
                  {place.kind}
                </Badge>
              </td>
              <td className="p-3">
                {place.ratingSelf && place.ratingSelf > 0 ? (
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm">{place.ratingSelf}</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </td>
              <td className="p-3">
                <Badge
                  variant={
                    place.visitStatus === 'visited'
                      ? 'default'
                      : place.visitStatus === 'planned'
                      ? 'outline'
                      : 'secondary'
                  }
                  className="text-xs"
                >
                  {place.visitStatus === 'visited'
                    ? 'Visited'
                    : place.visitStatus === 'planned'
                    ? 'Planned'
                    : 'Not Visited'}
                </Badge>
              </td>
              <td className="p-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onView(place)
                  }}
                >
                  View
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
