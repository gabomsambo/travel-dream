"use client"

import { useState, useEffect, useTransition, useMemo, useCallback, useRef } from "react"
import { DndContext, type DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Plus, Sparkles, Save } from "lucide-react"
import { toast } from "sonner"
import { DayColumn } from "./day-column"
import { UnscheduledList } from "./unscheduled-list"
import { DayMetrics } from "./day-metrics"
import { AutoCreateDaysDialog } from "./auto-create-days-dialog"
import { useCollectionMapContextOptional } from "@/components/collections/collection-map-context"
import { CollectionMapRenderer } from "@/components/collections/collection-map-renderer"
import type { Collection, Place, DayBucket } from "@/types/database"

interface DayPlannerClientProps {
  initialCollection: Collection & { places: Place[] }
}

function computeInitialUnscheduled(
  collection: Collection & { places: Place[] }
): string[] {
  const savedUnscheduled = collection.unscheduledPlaceIds
  const dayBuckets = collection.dayBuckets || []

  // Get all place IDs that are already scheduled in days
  const scheduledIds = new Set(
    dayBuckets.flatMap((day) => day.placeIds || [])
  )

  // If we have saved unscheduled IDs with content, use them (filtered to exclude scheduled)
  if (Array.isArray(savedUnscheduled) && savedUnscheduled.length > 0) {
    return savedUnscheduled.filter(id => !scheduledIds.has(id))
  }

  // Otherwise, compute from all places minus scheduled
  return collection.places
    .map(p => p.id)
    .filter(id => !scheduledIds.has(id))
}

export function DayPlannerClient({ initialCollection }: DayPlannerClientProps) {
  const mapContext = useCollectionMapContextOptional()
  const dayBuckets = Array.isArray(initialCollection.dayBuckets)
    ? initialCollection.dayBuckets
    : []
  const unscheduledIds = computeInitialUnscheduled(initialCollection)

  const [days, setDays] = useState<DayBucket[]>(dayBuckets)
  const [unscheduledPlaceIds, setUnscheduledPlaceIds] = useState<string[]>(unscheduledIds)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(days[0]?.id || null)
  const [transportMode, setTransportMode] = useState<'drive' | 'walk'>(
    (initialCollection.transportMode as 'drive' | 'walk') || 'drive'
  )
  const [showAutoCreate, setShowAutoCreate] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isAltKeyPressed, setIsAltKeyPressed] = useState(false)

  const hoveredPlaceId = mapContext?.hoveredPlaceId ?? null
  const setHoveredPlaceId = mapContext?.hoverPlace ?? (() => {})

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const selectedDay = useMemo(
    () => days.find((d) => d.id === selectedDayId),
    [days, selectedDayId]
  )

  const selectedDayPlaces = useMemo(() => {
    if (!selectedDay) return []
    return selectedDay.placeIds
      .map(id => initialCollection.places.find(p => p.id === id))
      .filter((p): p is Place => p !== undefined)
  }, [selectedDay, initialCollection.places])

  useEffect(() => {
    if (mapContext && selectedDay) {
      mapContext.updateMapView({
        mode: 'day',
        places: selectedDayPlaces,
        transportMode,
        dayNumber: selectedDay.dayNumber,
      })
    }
  }, [selectedDay, selectedDayPlaces, transportMode, mapContext])

  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsSaving(true)
      console.log('[DayPlannerClient] Auto-saving changes...')
      console.log('[DayPlannerClient] Days count:', days.length)
      console.log('[DayPlannerClient] Days data:', days)
      console.log('[DayPlannerClient] Unscheduled place IDs count:', unscheduledPlaceIds.length)
      console.log('[DayPlannerClient] Unscheduled place IDs:', unscheduledPlaceIds)

      try {
        const response = await fetch(`/api/collections/${initialCollection.id}/days`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dayBuckets: days, unscheduledPlaceIds }),
        })

        const result = await response.json()
        console.log('[DayPlannerClient] Save response:', result)

        if (!response.ok) {
          console.error('[DayPlannerClient] Save failed:', result)
          toast.error('Failed to save changes')
        } else {
          console.log('[DayPlannerClient] Save successful')
        }
      } catch (error) {
        console.error('[DayPlannerClient] Error saving day buckets:', error)
        toast.error('Failed to save changes')
      }
      setIsSaving(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [days, unscheduledPlaceIds, initialCollection.id])

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await fetch(`/api/collections/${initialCollection.id}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transportMode }),
        })
      } catch (error) {
        console.error('Error saving transport mode:', error)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [transportMode, initialCollection.id])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) setIsAltKeyPressed(true)
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) setIsAltKeyPressed(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string
    const isCopyMode = isAltKeyPressed

    const sourceDayId = days.find((d) => d.placeIds.includes(activeId))?.id
    const isFromUnscheduled = unscheduledPlaceIds.includes(activeId)

    let destDayId: string | null = null
    let destIsUnscheduled = false

    if (overId === "unscheduled") {
      destIsUnscheduled = true
    } else if (overId.startsWith("day-")) {
      destDayId = overId
    } else {
      destDayId = days.find((d) => d.placeIds.includes(overId))?.id || null
      destIsUnscheduled = unscheduledPlaceIds.includes(overId)
    }

    if (sourceDayId && sourceDayId === destDayId) {
      const sourceDay = days.find((d) => d.id === sourceDayId)
      if (!sourceDay) return

      const oldIndex = sourceDay.placeIds.indexOf(activeId)
      const newIndex = sourceDay.placeIds.indexOf(overId)

      if (oldIndex === -1 || newIndex === -1) return

      const reorderedPlaceIds = arrayMove(sourceDay.placeIds, oldIndex, newIndex)
      setDays(days.map((d) =>
        d.id === sourceDayId ? { ...d, placeIds: reorderedPlaceIds } : d
      ))
      return
    }

    if (destIsUnscheduled) {
      if (sourceDayId) {
        setDays(
          days.map((d) => (d.id === sourceDayId ? { ...d, placeIds: d.placeIds.filter((id) => id !== activeId) } : d))
        )
      }
      if (!unscheduledPlaceIds.includes(activeId)) {
        setUnscheduledPlaceIds([...unscheduledPlaceIds, activeId])
      }
    } else if (destDayId) {
      const destDay = days.find((d) => d.id === destDayId)
      if (!destDay) return

      if (destDay.placeIds.includes(activeId)) {
        toast.error('Place already in this day')
        return
      }

      if (!isCopyMode) {
        if (isFromUnscheduled) {
          setUnscheduledPlaceIds(unscheduledPlaceIds.filter((id) => id !== activeId))
        } else if (sourceDayId) {
          setDays(
            days.map((d) => (d.id === sourceDayId ? { ...d, placeIds: d.placeIds.filter((id) => id !== activeId) } : d))
          )
        }
      }

      const destIndex = destDay.placeIds.indexOf(overId)
      const newPlaceIds = [...destDay.placeIds]
      if (destIndex >= 0) {
        newPlaceIds.splice(destIndex + 1, 0, activeId)
      } else {
        newPlaceIds.push(activeId)
      }

      setDays(days.map((d) => (d.id === destDayId ? { ...d, placeIds: newPlaceIds } : d)))

      if (isCopyMode && sourceDayId) {
        toast.success(`Copied to Day ${destDay.dayNumber}`)
      }
    }
  }

  const handleCreateDay = () => {
    const newDay: DayBucket = {
      id: `day-${Date.now()}`,
      dayNumber: days.length + 1,
      placeIds: [],
    }
    setDays([...days, newDay])
    setSelectedDayId(newDay.id)
  }

  const handleDeleteDay = (dayId: string) => {
    const day = days.find(d => d.id === dayId)
    if (!day) return

    console.log('[handleDeleteDay] Deleting day:', dayId, 'with', day.placeIds.length, 'places')

    const remainingDays = days.filter(d => d.id !== dayId).map((d, i) => ({ ...d, dayNumber: i + 1 }))

    setUnscheduledPlaceIds([...unscheduledPlaceIds, ...day.placeIds])
    setDays(remainingDays)

    if (selectedDayId === dayId) {
      setSelectedDayId(remainingDays[0]?.id || null)
    }

    console.log('[handleDeleteDay] After delete - remaining days:', remainingDays.length, 'unscheduled:', unscheduledPlaceIds.length + day.placeIds.length)
  }

  const handleUpdateDay = (dayId: string, updates: Partial<DayBucket>) => {
    setDays(days.map(d => d.id === dayId ? { ...d, ...updates } : d))
  }

  const handleCopyPlaceToDay = (placeId: string, targetDayId: string) => {
    const targetDay = days.find(d => d.id === targetDayId)
    if (!targetDay) return

    if (targetDay.placeIds.includes(placeId)) {
      toast.error('Place already in this day')
      return
    }

    setDays(days.map(d =>
      d.id === targetDayId
        ? { ...d, placeIds: [...d.placeIds, placeId] }
        : d
    ))
    toast.success(`Copied to Day ${targetDay.dayNumber}`)
  }

  const handleRemovePlaceFromDay = (placeId: string) => {
    if (!unscheduledPlaceIds.includes(placeId)) {
      setUnscheduledPlaceIds(prev => [...prev, placeId])
    }
  }

  const handleAutoCreate = async (hoursPerDay: number) => {
    try {
      const response = await fetch(`/api/collections/${initialCollection.id}/days/auto-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hoursPerDay, transportMode }),
      })

      const data = await response.json()
      if (data.status === 'success') {
        setDays(data.dayBuckets)
        setUnscheduledPlaceIds([])
        setSelectedDayId(data.dayBuckets[0]?.id || null)
        toast.success(`Created ${data.dayBuckets.length} days`)
      }
    } catch (error) {
      console.error('Error auto-creating days:', error)
      toast.error('Failed to auto-create days')
    }
    setShowAutoCreate(false)
  }

  const totalStops = days.reduce((sum, d) => sum + d.placeIds.length, 0)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="container flex h-14 items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{initialCollection.name} - Day Planner</h1>
          </div>
          <div className="flex items-center gap-2">
            {isSaving ? (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Save className="h-4 w-4 animate-pulse" />
                Saving...
              </span>
            ) : (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Save className="h-4 w-4 text-green-600" />
                Saved
              </span>
            )}
          </div>
        </div>
      </header>

      <DayMetrics
        stops={totalStops}
        transportMode={transportMode}
        onTransportModeChange={setTransportMode}
      />

      <div className="container py-6">
        <div className="flex gap-4 mb-6">
          <Button onClick={handleCreateDay}>
            <Plus className="h-4 w-4 mr-2" />
            New Day
          </Button>
          <Button variant="outline" onClick={() => setShowAutoCreate(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            Auto-Create Days
          </Button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {days.map((day) => {
                const placeMap = new Map(initialCollection.places.map(p => [p.id, p]))
                const orderedPlaces = day.placeIds
                  .map(id => placeMap.get(id))
                  .filter((p): p is Place => p !== undefined)

                return (
                  <DayColumn
                    key={day.id}
                    day={day}
                    places={orderedPlaces}
                    isSelected={selectedDayId === day.id}
                    onSelect={() => setSelectedDayId(day.id)}
                    onUpdate={(updates) => handleUpdateDay(day.id, updates)}
                    onDelete={() => handleDeleteDay(day.id)}
                    transportMode={transportMode}
                    hoveredPlaceId={hoveredPlaceId}
                    onPlaceHover={setHoveredPlaceId}
                    allDays={days.map(d => ({ id: d.id, dayNumber: d.dayNumber }))}
                    onCopyPlaceToDay={handleCopyPlaceToDay}
                    onRemovePlaceFromDay={handleRemovePlaceFromDay}
                  />
                )
              })}

              <UnscheduledList
                placeIds={unscheduledPlaceIds}
                places={unscheduledPlaceIds
                  .map(id => initialCollection.places.find(p => p.id === id))
                  .filter((p): p is Place => p !== undefined)}
                hoveredPlaceId={hoveredPlaceId}
                onPlaceHover={setHoveredPlaceId}
              />
            </div>

            {/* Map (responsive - handles both desktop inline and mobile FAB+sheet) */}
            <div className="lg:col-span-1">
              <CollectionMapRenderer className="h-[500px] w-full rounded-lg overflow-hidden border sticky top-20" />
            </div>
          </div>
        </DndContext>
      </div>

      <AutoCreateDaysDialog
        open={showAutoCreate}
        onOpenChange={setShowAutoCreate}
        places={initialCollection.places}
        onApply={handleAutoCreate}
        transportMode={transportMode}
      />
    </div>
  )
}
