"use client"

import { MapPin, Calendar, DollarSign, Star, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ConfidenceIndicator } from "@/components/inbox/confidence-indicator"
import type { Place } from "@/types/database"

interface PlaceDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  place: Place | null
  onEdit?: (placeId: string) => void
  onArchive?: (placeId: string) => void
}

export function PlaceDetailsDialog({
  open,
  onOpenChange,
  place,
  onEdit,
  onArchive,
}: PlaceDetailsDialogProps) {
  if (!place) return null

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{place.name}</DialogTitle>
          <DialogDescription asChild>
            <span className="flex items-center gap-2 mt-2">
              <MapPin className="h-4 w-4" />
              <span>
                {[place.city, place.admin, place.country]
                  .filter(Boolean)
                  .join(', ') || 'Location not specified'}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Kind and Tags */}
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

          {/* Description */}
          {place.description && (
            <div>
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-muted-foreground">{place.description}</p>
            </div>
          )}

          {/* Metadata Grid */}
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

            {place.confidence !== null && place.confidence !== undefined && (
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Confidence</div>
                <ConfidenceIndicator
                  confidence={place.confidence}
                  variant="badge"
                  size="sm"
                />
              </div>
            )}

            {place.ratingSelf !== null && place.ratingSelf !== undefined && place.ratingSelf > 0 && (
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  Your Rating
                </div>
                <div className="font-medium">{place.ratingSelf}/5</div>
              </div>
            )}
          </div>

          <Separator />

          {/* Activities */}
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

          {/* Cuisine */}
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

          {/* Amenities */}
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

          {/* Vibes */}
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

          {/* Notes */}
          {place.notes && (
            <div>
              <h3 className="font-semibold mb-2">Notes</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {place.notes}
              </p>
            </div>
          )}

          {/* Address */}
          {place.address && (
            <div>
              <h3 className="font-semibold mb-2">Address</h3>
              <p className="text-muted-foreground">{place.address}</p>
            </div>
          )}

          {/* Coordinates */}
          {place.coords && (
            <div>
              <h3 className="font-semibold mb-2">Coordinates</h3>
              <p className="text-muted-foreground font-mono text-sm">
                {place.coords.lat.toFixed(6)}, {place.coords.lon.toFixed(6)}
              </p>
            </div>
          )}

          <Separator />

          {/* Timestamps */}
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Created: {formatDate(place.createdAt)}</div>
            <div>Updated: {formatDate(place.updatedAt)}</div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            {onEdit && (
              <Button onClick={() => onEdit(place.id)} variant="outline">
                Edit
              </Button>
            )}
            {onArchive && (
              <Button
                onClick={() => onArchive(place.id)}
                variant="outline"
                className="text-destructive"
              >
                Archive
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)} variant="default" className="ml-auto">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
