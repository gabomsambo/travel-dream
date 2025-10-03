import { MoreVertical, Check, X, Edit, Merge, MapPin } from "lucide-react"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  onMerge?: (placeId: string) => void
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
  onMerge
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
            <div>c - confirm</div>
            <div>x - archive</div>
            <div>e - edit</div>
          </div>
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

        {showActions && !selectable && (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
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

        {Array.isArray(place.vibes) && place.vibes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.vibes.slice(0, 2).map((vibe: string) => (
              <Badge key={vibe} variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                {vibe}
              </Badge>
            ))}
          </div>
        )}

        {/* Enhanced confidence indicator */}
        {showConfidence && place.confidence !== undefined && (
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
        <CardFooter className="flex gap-2 pt-0">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation()
              onConfirm?.(place.id)
            }}
          >
            <Check className="mr-1 h-3 w-3" />
            Confirm
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              onEdit?.(place.id)
            }}
          >
            <Edit className="mr-1 h-3 w-3" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              onMerge?.(place.id)
            }}
          >
            <Merge className="mr-1 h-3 w-3" />
            Merge
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
