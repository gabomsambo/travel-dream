"use client"

import { useMemo } from 'react'
import { Calendar, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useMapContext } from './map-context'
import { DAY_COLORS, getDayColor } from '@/lib/map-utils'
import type { DayBucket } from '@/types/database'

export function MapDayOverlay() {
  const {
    collections,
    filters,
    updateFilters
  } = useMapContext()

  const selectedCollection = useMemo(() => {
    if (!filters.collectionId) return null
    return collections.find(c => c.id === filters.collectionId) || null
  }, [collections, filters.collectionId])

  const dayBuckets = useMemo(() => {
    if (!selectedCollection) return []
    return (selectedCollection.dayBuckets as DayBucket[]) || []
  }, [selectedCollection])

  const availableDays = useMemo(() => {
    return dayBuckets
      .map(bucket => bucket.dayNumber)
      .filter((day, index, self) => self.indexOf(day) === index)
      .sort((a, b) => a - b)
  }, [dayBuckets])

  if (!filters.collectionId || availableDays.length === 0) {
    return null
  }

  const handleToggleOverlay = () => {
    updateFilters({
      showDayOverlay: !filters.showDayOverlay,
      activeDays: filters.showDayOverlay ? [] : availableDays
    })
  }

  const handleToggleDay = (day: number) => {
    if (!filters.showDayOverlay) {
      updateFilters({
        showDayOverlay: true,
        activeDays: [day]
      })
      return
    }

    const newActiveDays = filters.activeDays.includes(day)
      ? filters.activeDays.filter(d => d !== day)
      : [...filters.activeDays, day]

    updateFilters({ activeDays: newActiveDays })
  }

  const handleShowAll = () => {
    updateFilters({ activeDays: availableDays })
  }

  return (
    <div className="border-t bg-background p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Day Overlay</span>
        </div>
        <Button
          variant={filters.showDayOverlay ? 'default' : 'outline'}
          size="sm"
          onClick={handleToggleOverlay}
        >
          {filters.showDayOverlay ? 'Hide' : 'Show'}
        </Button>
      </div>

      {filters.showDayOverlay && (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={filters.activeDays.length === availableDays.length ? 'default' : 'outline'}
              className="cursor-pointer text-xs"
              onClick={handleShowAll}
            >
              All Days
            </Badge>
            {availableDays.map(day => {
              const dayColor = getDayColor(day)
              const isActive = filters.activeDays.includes(day)
              const bucket = dayBuckets.find(b => b.dayNumber === day)
              const placeCount = bucket?.placeIds.length || 0

              return (
                <Badge
                  key={day}
                  variant={isActive ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  style={
                    isActive
                      ? { backgroundColor: dayColor, borderColor: dayColor }
                      : { borderColor: `${dayColor}50`, color: dayColor }
                  }
                  onClick={() => handleToggleDay(day)}
                >
                  Day {day} ({placeCount})
                </Badge>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {availableDays.slice(0, 8).map(day => (
              <div key={day} className="flex items-center gap-1 text-xs">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: getDayColor(day) }}
                />
                <span className="text-muted-foreground">Day {day}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
