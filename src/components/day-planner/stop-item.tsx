"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { GripVertical, Lock, Unlock, X, MoreVertical, Copy } from "lucide-react"
import type { Place } from "@/types/database"
import { cn } from "@/lib/utils"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface StopItemProps {
  place: Place
  index: number
  isLocked: boolean
  onToggleLock: () => void
  onRemove: () => void
  isHovered: boolean
  onHover: (placeId: string | null) => void
  availableDays: Array<{ id: string; dayNumber: number }>
  currentDayId: string
  onCopyToDay: (targetDayId: string) => void
}

export function StopItem({
  place,
  index,
  isLocked,
  onToggleLock,
  onRemove,
  isHovered,
  onHover,
  availableDays,
  currentDayId,
  onCopyToDay,
}: StopItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: place.id,
    disabled: isLocked,
  })

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
        isHovered && "ring-2 ring-primary shadow-md",
        isLocked && "border-primary/50 bg-primary/5"
      )}
      onMouseEnter={() => onHover(place.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        {...attributes}
        {...(isLocked ? {} : listeners)}
        className={cn(
          "cursor-grab active:cursor-grabbing text-muted-foreground flex-shrink-0",
          isLocked && "cursor-not-allowed opacity-30"
        )}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
        {index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm line-clamp-1">{place.name}</h4>
        <p className="text-xs text-muted-foreground">
          {place.city && place.country ? `${place.city}, ${place.country}` : place.city || place.country || ''}
        </p>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => e.stopPropagation()}
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {availableDays
              .filter(day => day.id !== currentDayId)
              .map(day => (
                <DropdownMenuItem
                  key={day.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    onCopyToDay(day.id)
                  }}
                >
                  <Copy className="h-3 w-3 mr-2" />
                  Copy to Day {day.dayNumber}
                </DropdownMenuItem>
              ))}
            {availableDays.filter(day => day.id !== currentDayId).length === 0 && (
              <DropdownMenuItem disabled>No other days available</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              variant="destructive"
            >
              <X className="h-3 w-3 mr-2" />
              Remove from day
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation()
            onToggleLock()
          }}
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          title={isLocked ? "Unlock (allow reordering)" : "Lock (prevent reordering)"}
        >
          {isLocked ? (
            <Lock className="h-3 w-3 text-primary" />
          ) : (
            <Unlock className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  )
}
