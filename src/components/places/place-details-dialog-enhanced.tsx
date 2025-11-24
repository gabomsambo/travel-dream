"use client"

import { useState, useEffect } from "react"
import { X, Maximize2 } from "lucide-react"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/adapters/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/adapters/button"
import { OverviewTab } from "./place-details-tabs/overview-tab"
import { MediaTab } from "./place-details-tabs/media-tab"
import { LinksTab } from "./place-details-tabs/links-tab"
import { BookingsTab } from "./place-details-tabs/bookings-tab"
import { PlanningTab } from "./place-details-tabs/planning-tab"
import { NotesTab } from "./place-details-tabs/notes-tab"
import type { PlaceWithRelations } from "@/types/database"

interface PlaceDetailsDialogEnhancedProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  placeId: string | null
}

export function PlaceDetailsDialogEnhanced({
  open,
  onOpenChange,
  placeId,
}: PlaceDetailsDialogEnhancedProps) {
  const [place, setPlace] = useState<PlaceWithRelations | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!placeId || !open) {
      setPlace(null)
      return
    }

    const fetchPlace = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/places/${placeId}`)

        if (!response.ok) {
          throw new Error('Failed to fetch place')
        }

        const data = await response.json()

        if (data.id) {
          setPlace({
            id: data.id,
            name: data.name,
            kind: data.kind,
            city: data.city,
            country: data.country,
            admin: data.admin,
            coords: data.coords,
            address: data.address,
            googlePlaceId: data.googlePlaceId,
            altNames: data.altNames,
            description: data.description,
            tags: data.tags,
            vibes: data.vibes,
            ratingSelf: data.ratingSelf,
            notes: data.notes,
            status: data.status,
            confidence: data.confidence,
            price_level: data.price_level,
            best_time: data.best_time,
            activities: data.activities,
            cuisine: data.cuisine,
            amenities: data.amenities,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            website: data.website,
            phone: data.phone,
            email: data.email,
            hours: data.hours,
            visitStatus: data.visitStatus,
            priority: data.priority,
            lastVisited: data.lastVisited,
            plannedVisit: data.plannedVisit,
            recommendedBy: data.recommendedBy,
            companions: data.companions,
            practicalInfo: data.practicalInfo,
            attachments: data.attachments || [],
            links: data.links || [],
            reservations: data.reservations || [],
            sources: data.sources || [],
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchPlace()
  }, [placeId, open])

  const handleRefresh = async () => {
    if (!placeId) return

    setLoading(true)
    try {
      const response = await fetch(`/api/places/${placeId}`)
      const data = await response.json()

      if (data.id) {
        setPlace({
          id: data.id,
          name: data.name,
          kind: data.kind,
          city: data.city,
          country: data.country,
          admin: data.admin,
          coords: data.coords,
          address: data.address,
          googlePlaceId: data.googlePlaceId,
          altNames: data.altNames,
          description: data.description,
          tags: data.tags,
          vibes: data.vibes,
          ratingSelf: data.ratingSelf,
          notes: data.notes,
          status: data.status,
          confidence: data.confidence,
          price_level: data.price_level,
          best_time: data.best_time,
          activities: data.activities,
          cuisine: data.cuisine,
          amenities: data.amenities,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          website: data.website,
          phone: data.phone,
          email: data.email,
          hours: data.hours,
          visitStatus: data.visitStatus,
          priority: data.priority,
          lastVisited: data.lastVisited,
          plannedVisit: data.plannedVisit,
          recommendedBy: data.recommendedBy,
          companions: data.companions,
          practicalInfo: data.practicalInfo,
          attachments: data.attachments || [],
          links: data.links || [],
          reservations: data.reservations || [],
          sources: data.sources || [],
        })
      }
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold pr-8">
            {loading ? 'Loading...' : place?.name || 'Place Details'}
          </DialogTitle>

          {/* Full View Button */}
          {place && (
            <Link href={`/place/${place.id}`}>
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-12 top-4"
              >
                <Maximize2 className="h-4 w-4 mr-2" />
                Full View
              </Button>
            </Link>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {place && (
          <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="media">
                Media {place.attachments.length > 0 && `(${place.attachments.length})`}
              </TabsTrigger>
              <TabsTrigger value="links">
                Links {place.links.length > 0 && `(${place.links.length})`}
              </TabsTrigger>
              <TabsTrigger value="bookings">Bookings</TabsTrigger>
              <TabsTrigger value="planning">Planning</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-4">
              <TabsContent value="overview" className="m-0">
                <OverviewTab place={place} />
              </TabsContent>

              <TabsContent value="media" className="m-0">
                <MediaTab place={place} onUpdate={handleRefresh} />
              </TabsContent>

              <TabsContent value="links" className="m-0">
                <LinksTab place={place} onUpdate={handleRefresh} />
              </TabsContent>

              <TabsContent value="bookings" className="m-0">
                <BookingsTab place={place} onUpdate={handleRefresh} />
              </TabsContent>

              <TabsContent value="planning" className="m-0">
                <PlanningTab place={place} onUpdate={handleRefresh} />
              </TabsContent>

              <TabsContent value="notes" className="m-0">
                <NotesTab place={place} onUpdate={handleRefresh} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
