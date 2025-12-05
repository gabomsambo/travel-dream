import { MoreVertical, Check, X, Edit, MapPin, Calendar, Eye, Trash2 } from "lucide-react"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/adapters/card"
import { Badge } from "@/components/adapters/badge"
import { Button } from "@/components/adapters/button"
import { Checkbox } from "@/components/adapters/checkbox"
import { ConfidenceIndicator } from "@/components/inbox/confidence-indicator"
import { cn } from "@/lib/utils"
import type { Place } from "@/types/database"

interface PlaceCardProps {
  place: Place
  showActions?: boolean
  showConfidence?: boolean
  selectable?: boolean
  selected?: boolean
  onSelectionChange?: (placeId: string, selected: boolean) => void
  onItemClick?: (placeId: string, index: number, event: React.MouseEvent) => void
  index?: number
  showKeyboardHints?: boolean
  onConfirm?: (placeId: string) => void
  onArchive?: (placeId: string) => void
  onEdit?: (placeId: string) => void
  onView?: (placeId: string) => void
}

export function PlaceCard({
  place,
  showActions = true,
  showConfidence = false,
  selectable = false,
  selected = false,
  onSelectionChange,
  onItemClick,
  index = 0,
  showKeyboardHints = false,
  onConfirm,
  onArchive,
  onEdit,
  onView
}: PlaceCardProps) {
  const handleCardClick = (e: React.MouseEvent) => {
    if (selectable && onItemClick) {
      onItemClick(place.id, index, e)
    }
  }

  const handleCheckboxChange = (checked: boolean) => {
    if (onSelectionChange) {
      onSelectionChange(place.id, checked)
    }
  }
  return (
    <Card
      className={cn(
        "hover:shadow-lg transition-all duration-200 relative group",
        selectable && "cursor-pointer hover:bg-accent/5",
        selected && "ring-2 ring-primary bg-accent/10"
      )}
      onClick={handleCardClick}
    >
      {/* Selection checkbox overlay */}
      {selectable && (
        <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <Checkbox
            checked={selected}
            onCheckedChange={handleCheckboxChange}
            className="bg-background shadow-sm"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      {showKeyboardHints && selectable && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-background/90 backdrop-blur-sm border rounded px-2 py-1 text-xs text-muted-foreground shadow-sm">
            <div>x - archive</div>
            <div>e - edit</div>
          </div>
        </div>
      )}

      {/* Quick delete button */}
      {onArchive && !showKeyboardHints && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 shadow-sm"
            onClick={(e) => {
              e.stopPropagation()
              onArchive(place.id)
            }}
            title="Delete place"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      <CardHeader className={cn(
        "flex flex-row items-start justify-between space-y-0 pb-2",
        selectable && "pl-8" // Add padding when checkbox is shown
      )}>
        <div className="space-y-1 flex-1">
          <h3 className="font-semibold leading-none tracking-tight">
            {place.name}
          </h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>
              {place.city && place.country
                ? `${place.city}, ${place.country}`
                : place.city || place.country || 'Location unknown'
              }
            </span>
          </div>
        </div>

        {(showActions || onView) && !selectable && (
          <div className="flex gap-1">
            {onView && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  onView(place.id)
                }}
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
            {showActions && (
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{place.kind}</Badge>
          {Array.isArray(place.tags) && place.tags.slice(0, 3).map((tag: string) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {Array.isArray(place.tags) && place.tags.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{place.tags.length - 3}
            </Badge>
          )}
        </div>

        {/* Price & Time Metadata */}
        {(place.price_level || place.best_time) && (
          <div className="flex items-center gap-1 flex-wrap">
            {place.price_level && (
              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                {place.price_level}
              </Badge>
            )}
            {place.best_time && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                <Calendar className="h-3 w-3 mr-1" />
                {place.best_time}
              </Badge>
            )}
          </div>
        )}

        {/* Activities */}
        {Array.isArray(place.activities) && place.activities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.activities.slice(0, 3).map((activity: string) => (
              <Badge key={activity} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                {activity}
              </Badge>
            ))}
            {place.activities.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{place.activities.length - 3} activities
              </Badge>
            )}
          </div>
        )}

        {/* Cuisine (restaurants/cafes only) */}
        {Array.isArray(place.cuisine) && place.cuisine.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.cuisine.slice(0, 3).map((item: string) => (
              <Badge key={item} variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                {item}
              </Badge>
            ))}
            {place.cuisine.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{place.cuisine.length - 3} cuisine
              </Badge>
            )}
          </div>
        )}

        {/* Amenities */}
        {Array.isArray(place.amenities) && place.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.amenities.slice(0, 2).map((amenity: string) => (
              <Badge key={amenity} variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                {amenity}
              </Badge>
            ))}
            {place.amenities.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{place.amenities.length - 2} amenities
              </Badge>
            )}
          </div>
        )}

        {Array.isArray(place.vibes) && place.vibes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.vibes.slice(0, 2).map((vibe: string) => (
              <Badge key={vibe} variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                {vibe}
              </Badge>
            ))}
          </div>
        )}

        {/* Description */}
        {place.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {place.description}
          </p>
        )}

        {/* Enhanced confidence indicator */}
        {showConfidence && place.confidence !== undefined && place.confidence !== null && (
          <ConfidenceIndicator
            confidence={place.confidence}
            variant="bar"
            size="default"
            showTooltip={true}
          />
        )}
      </CardContent>

      {place.notes && (
        <CardFooter>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {place.notes}
          </p>
        </CardFooter>
      )}

      {showActions && (
        <CardFooter className="flex flex-wrap gap-2 pt-0">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation()
              onEdit?.(place.id)
            }}
          >
            <Edit className="mr-1 h-3 w-3" />
            Continue to Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              onArchive?.(place.id)
            }}
          >
            <X className="mr-1 h-3 w-3" />
            Archive
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
