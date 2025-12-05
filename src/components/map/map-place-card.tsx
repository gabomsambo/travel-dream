"use client"

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { KindBadge } from '@/components/ui/kind-badge'
import type { MapPlace } from '@/types/map'
import { getDayColor } from '@/lib/map-utils'

interface MapPlaceCardProps {
  place: MapPlace
  isSelected: boolean
  isHovered: boolean
  showDayOverlay: boolean
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export function MapPlaceCard({
  place,
  isSelected,
  isHovered,
  showDayOverlay,
  onClick,
  onMouseEnter,
  onMouseLeave
}: MapPlaceCardProps) {
  const dayColor = place.dayNumber ? getDayColor(place.dayNumber) : null

  return (
    <div
      data-place-id={place.id}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "p-3 border-b cursor-pointer transition-colors",
        isSelected && "bg-primary/10 border-l-2 border-l-primary",
        isHovered && !isSelected && "bg-muted/50",
        !isSelected && !isHovered && "hover:bg-muted/30"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{place.name}</h4>
          {(place.city || place.country) && (
            <p className="text-xs text-muted-foreground truncate">
              {[place.city, place.country].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {showDayOverlay && place.dayNumber && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0"
              style={{ borderColor: dayColor || undefined, color: dayColor || undefined }}
            >
              Day {place.dayNumber}
            </Badge>
          )}
          <KindBadge kind={place.kind} size="sm" />
        </div>
      </div>
    </div>
  )
}
