"use client"

import { useState, useEffect, useTransition } from "react"
import { DndContext, type DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Plus, Calendar, Sparkles, Save } from "lucide-react"
import { toast } from "sonner"
import { DayColumn } from "./day-column"
import { UnscheduledList } from "./unscheduled-list"
import { DayMap } from "./day-map"
import { DayMetrics } from "./day-metrics"
import { AutoCreateDaysDialog } from "./auto-create-days-dialog"
import type { Collection, Place, DayBucket } from "@/types/database"

interface DayPlannerClientProps {
  initialCollection: Collection & { places: Place[] }
}

export function DayPlannerClient({ initialCollection }: DayPlannerClientProps) {
  const dayBuckets = Array.isArray(initialCollection.dayBuckets)
    ? initialCollection.dayBuckets
    : []
  const unscheduledIds = Array.isArray(initialCollection.unscheduledPlaceIds)
    && initialCollection.unscheduledPlaceIds.length > 0
    ? initialCollection.unscheduledPlaceIds
    : initialCollection.places.map(p => p.id)

  const [days, setDays] = useState<DayBucket[]>(dayBuckets)
  const [unscheduledPlaceIds, setUnscheduledPlaceIds] = useState<string[]>(unscheduledIds)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(days[0]?.id || null)
  const [transportMode, setTransportMode] = useState<'drive' | 'walk'>(
    (initialCollection.transportMode as 'drive' | 'walk') || 'drive'
  )
  const [showAutoCreate, setShowAutoCreate] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const selectedDay = days.find((d) => d.id === selectedDayId)
  const selectedDayPlaces = selectedDay
    ? selectedDay.placeIds
        .map(id => initialCollection.places.find(p => p.id === id))
        .filter((p): p is Place => p !== undefined)
    : []

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

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

      if (isFromUnscheduled) {
        setUnscheduledPlaceIds(unscheduledPlaceIds.filter((id) => id !== activeId))
      } else if (sourceDayId) {
        setDays(
          days.map((d) => (d.id === sourceDayId ? { ...d, placeIds: d.placeIds.filter((id) => id !== activeId) } : d))
        )
      }

      const destIndex = destDay.placeIds.indexOf(overId)
      const newPlaceIds = [...destDay.placeIds]
      if (destIndex >= 0) {
        newPlaceIds.splice(destIndex + 1, 0, activeId)
      } else {
        newPlaceIds.push(activeId)
      }

      setDays(days.map((d) => (d.id === destDayId ? { ...d, placeIds: newPlaceIds } : d)))
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

            <div className="lg:col-span-1">
              {selectedDay && (
                <DayMap
                  places={selectedDayPlaces}
                  dayNumber={selectedDay.dayNumber}
                  hoveredPlaceId={hoveredPlaceId}
                  onPlaceHover={setHoveredPlaceId}
                  transportMode={transportMode}
                />
              )}
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
