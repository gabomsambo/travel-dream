"use client"

import { Badge } from "@/components/adapters/badge"
import { Separator } from "@/components/adapters/separator"
import { MapPin, DollarSign, Calendar } from "lucide-react"
import type { PlaceWithRelations } from "@/types/database"

interface OverviewTabProps {
  place: PlaceWithRelations
}

export function OverviewTab({ place }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-sm">
            {place.kind}
          </Badge>
          {Array.isArray(place.tags) &&
            place.tags.map((tag: string) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
        </div>
      </div>

      {place.description && (
        <div>
          <h3 className="font-semibold mb-2">Description</h3>
          <p className="text-muted-foreground">{place.description}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {place.price_level && (
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Price Level
            </div>
            <div className="font-medium">{place.price_level}</div>
          </div>
        )}

        {place.best_time && (
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Best Time
            </div>
            <div className="font-medium">{place.best_time}</div>
          </div>
        )}
      </div>

      <Separator />

      {Array.isArray(place.vibes) && place.vibes.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Vibes</h3>
          <div className="flex flex-wrap gap-2">
            {place.vibes.map((vibe: string) => (
              <Badge
                key={vibe}
                variant="outline"
                className="bg-purple-50 text-purple-700 border-purple-200"
              >
                {vibe}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(place.activities) && place.activities.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Activities</h3>
          <div className="flex flex-wrap gap-2">
            {place.activities.map((activity: string) => (
              <Badge
                key={activity}
                variant="outline"
                className="bg-blue-50 text-blue-700 border-blue-200"
              >
                {activity}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(place.cuisine) && place.cuisine.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Cuisine</h3>
          <div className="flex flex-wrap gap-2">
            {place.cuisine.map((item: string) => (
              <Badge
                key={item}
                variant="outline"
                className="bg-orange-50 text-orange-700 border-orange-200"
              >
                {item}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(place.amenities) && place.amenities.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Amenities</h3>
          <div className="flex flex-wrap gap-2">
            {place.amenities.map((amenity: string) => (
              <Badge
                key={amenity}
                variant="outline"
                className="bg-green-50 text-green-700 border-green-200"
              >
                {amenity}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Separator />

      <div className="space-y-3">
        <h3 className="font-semibold">Location Details</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {place.city && (
            <div>
              <span className="text-muted-foreground">City:</span>
              <span className="ml-2 font-medium">{place.city}</span>
            </div>
          )}
          {place.admin && (
            <div>
              <span className="text-muted-foreground">State/Region:</span>
              <span className="ml-2 font-medium">{place.admin}</span>
            </div>
          )}
          {place.country && (
            <div>
              <span className="text-muted-foreground">Country:</span>
              <span className="ml-2 font-medium">{place.country}</span>
            </div>
          )}
          {place.coords && (
            <div>
              <span className="text-muted-foreground">Coordinates:</span>
              <span className="ml-2 font-mono text-xs">
                {place.coords.lat.toFixed(6)}, {place.coords.lon.toFixed(6)}
              </span>
            </div>
          )}
        </div>

        {place.address && (
          <div>
            <span className="text-sm text-muted-foreground">Full Address:</span>
            <p className="text-sm mt-1">{place.address}</p>
          </div>
        )}
      </div>
    </div>
  )
}
