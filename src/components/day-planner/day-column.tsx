"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { StopItem } from "./stop-item"
import { Calendar, MapPin, Sparkles, Trash2, StickyNote, ChevronDown, ChevronUp } from "lucide-react"
import type { DayBucket, Place } from "@/types/database"
import { cn } from "@/lib/utils"
import { optimizeCollectionRoute } from "@/lib/algorithms/tsp"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

interface DayColumnProps {
  day: DayBucket
  places: Place[]
  isSelected: boolean
  onSelect: () => void
  onUpdate: (updates: Partial<DayBucket>) => void
  onDelete: () => void
  transportMode: 'drive' | 'walk'
  hoveredPlaceId: string | null
  onPlaceHover: (placeId: string | null) => void
}

export function DayColumn({
  day,
  places,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  transportMode,
  hoveredPlaceId,
  onPlaceHover,
}: DayColumnProps) {
  const [showNote, setShowNote] = useState(!!day.dayNote)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const { setNodeRef } = useDroppable({ id: day.id })

  const placesWithCoords = places.filter((p) => p.coords)
  const canOptimize = placesWithCoords.length >= 3

  const totalDistance = places.reduce((acc, place, index) => {
    if (index === 0 || !place.coords) return acc
    const prev = places[index - 1]
    if (!prev?.coords) return acc
    const dx = place.coords.lon - prev.coords.lon
    const dy = place.coords.lat - prev.coords.lat
    return acc + Math.sqrt(dx * dx + dy * dy) * 111
  }, 0)

  const avgSpeed = transportMode === 'drive' ? 60 : 5
  const timeHours = totalDistance / avgSpeed
  const hours = Math.floor(timeHours)
  const minutes = Math.round((timeHours - hours) * 60)

  const handleOptimize = () => {
    const lockedPlaceIds = day.lockedPlaceIds || []
    const lockedPlaces = places.filter((p) => lockedPlaceIds.includes(p.id))
    const unlockedPlaces = placesWithCoords.filter((p) => !lockedPlaceIds.includes(p.id))

    if (unlockedPlaces.length < 2) {
      toast.error('Need at least 2 unlocked places with coordinates to optimize')
      return
    }

    const result = optimizeCollectionRoute(unlockedPlaces, { returnToStart: false, maxPlaces: 50 })

    const finalOrder = []
    let optimizedIndex = 0
    for (const place of places) {
      if (lockedPlaceIds.includes(place.id)) {
        finalOrder.push(place)
      } else if (place.coords) {
        if (optimizedIndex < result.orderedPlaces.length) {
          finalOrder.push(result.orderedPlaces[optimizedIndex])
          optimizedIndex++
        }
      } else {
        finalOrder.push(place)
      }
    }

    const newPlaceIds = finalOrder.map((p) => p.id)
    onUpdate({ placeIds: newPlaceIds })

    const savedKm = totalDistance - result.totalDistance
    toast.success(`Route optimized! Saved ${savedKm.toFixed(1)}km`)
  }

  const handleToggleLock = (placeId: string) => {
    const locked = day.lockedPlaceIds || []
    const newLocked = locked.includes(placeId)
      ? locked.filter((id) => id !== placeId)
      : [...locked, placeId]
    onUpdate({ lockedPlaceIds: newLocked })
  }

  const handleRemovePlace = (placeId: string) => {
    onUpdate({ placeIds: day.placeIds.filter((id) => id !== placeId) })
  }

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "overflow-hidden transition-all duration-200",
        isSelected && "ring-2 ring-primary shadow-lg",
        places.length === 0 && "min-h-[200px]"
      )}
      onClick={onSelect}
    >
      <div className="p-4 bg-gradient-to-r from-primary/10 to-accent/10 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
              {day.dayNumber}
            </div>
            <div>
              <h3 className="font-semibold text-lg">Day {day.dayNumber}</h3>
              <p className="text-xs text-muted-foreground">
                {places.length} {places.length === 1 ? 'stop' : 'stops'}
                {totalDistance > 0 && ` · ${totalDistance.toFixed(1)}km`}
                {hours > 0 || minutes > 0 ? ` · ${hours}h ${minutes}m` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {canOptimize && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  handleOptimize()
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Optimize
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation()
                setShowNote(!showNote)
              }}
              className={cn(showNote && "text-primary")}
            >
              <StickyNote className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation()
                setIsCollapsed(!isCollapsed)
              }}
            >
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => e.stopPropagation()}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Day {day.dayNumber}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All places in this day will be moved to unscheduled. This action can be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {showNote && (
          <Textarea
            placeholder="Add notes for this day..."
            value={day.dayNote || ""}
            onChange={(e) => onUpdate({ dayNote: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="min-h-[80px]"
          />
        )}
      </div>

      {!isCollapsed && (
        <div className="p-4">
          {places.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Drop places here to schedule for this day</p>
            </div>
          ) : (
            <SortableContext items={day.placeIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {places.map((place, index) => (
                  <StopItem
                    key={place.id}
                    place={place}
                    index={index}
                    isLocked={day.lockedPlaceIds?.includes(place.id) || false}
                    onToggleLock={() => handleToggleLock(place.id)}
                    onRemove={() => handleRemovePlace(place.id)}
                    isHovered={hoveredPlaceId === place.id}
                    onHover={() => onPlaceHover(place.id)}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      )}
    </Card>
  )
}
