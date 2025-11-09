"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Inbox, GripVertical } from "lucide-react"
import type { Place } from "@/types/database"
import { cn } from "@/lib/utils"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface UnscheduledListProps {
  placeIds: string[]
  places: Place[]
  hoveredPlaceId: string | null
  onPlaceHover: (placeId: string | null) => void
}

function UnscheduledPlaceItem({
  place,
  isHovered,
  onHover,
}: {
  place: Place
  isHovered: boolean
  onHover: (placeId: string | null) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: place.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-3 p-3 hover:shadow-md transition-all duration-200 rounded-lg border-muted/50",
        isHovered && "ring-2 ring-primary shadow-md"
      )}
      onMouseEnter={() => onHover(place.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground flex-shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm line-clamp-1">{place.name}</h4>
        <p className="text-xs text-muted-foreground">
          {place.city && place.country ? `${place.city}, ${place.country}` : place.city || place.country || ''}
        </p>
      </div>

      <Badge variant="secondary" className="text-xs">
        {place.kind}
      </Badge>
    </Card>
  )
}

export function UnscheduledList({
  placeIds,
  places,
  hoveredPlaceId,
  onPlaceHover,
}: UnscheduledListProps) {
  const { setNodeRef } = useDroppable({ id: "unscheduled" })

  return (
    <Card ref={setNodeRef} className="overflow-hidden min-h-[200px]">
      <div className="p-4 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Unscheduled</h3>
          <Badge variant="secondary">{places.length}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Drag these places into days to schedule them
        </p>
      </div>

      <div className="p-3 space-y-2">
        {places.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">All places are scheduled!</p>
          </div>
        ) : (
          <SortableContext items={placeIds} strategy={verticalListSortingStrategy}>
            {places.map((place) => (
              <UnscheduledPlaceItem
                key={place.id}
                place={place}
                isHovered={hoveredPlaceId === place.id}
                onHover={onPlaceHover}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </Card>
  )
}
