"use client"

import { useState, useEffect } from 'react'
import { ArrowLeft, ExternalLink, MapPin, Clock, Globe, Phone, Mail, Navigation } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KindBadge } from '@/components/ui/kind-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMapContext } from './map-context'
import type { PlaceWithRelations } from '@/types/database'

export function MapPlaceDetails() {
  const { selectedPlaceId, selectPlace, flyTo } = useMapContext()
  const [place, setPlace] = useState<PlaceWithRelations | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedPlaceId) {
      setPlace(null)
      return
    }

    const fetchPlace = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/places/${selectedPlaceId}`)
        if (response.ok) {
          const data = await response.json()
          setPlace(data)
        }
      } catch (err) {
        console.error('Failed to fetch place:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchPlace()
  }, [selectedPlaceId])

  const handleBack = () => {
    selectPlace(null)
  }

  const handleGoToPlace = () => {
    if (place?.coords && typeof place.coords === 'object' && 'lat' in place.coords) {
      const coords = place.coords as { lat: number; lon: number }
      flyTo(coords.lon, coords.lat)
    }
  }

  if (!selectedPlaceId) return null

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to list
        </Button>
        {place && (
          <div className="flex items-center gap-1">
            {place.coords && (
              <Button
                variant="default"
                size="sm"
                onClick={handleGoToPlace}
                className="gap-2"
              >
                <Navigation className="h-4 w-4" />
                Go
              </Button>
            )}
            <Link href={`/place/${place.id}`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Full view
              </Button>
            </Link>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {place && !loading && (
        <ScrollArea className="flex-1">
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">{place.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <KindBadge kind={place.kind} size="md" />
                {(place.city || place.country) && (
                  <span className="text-sm text-muted-foreground">
                    {[place.city, place.country].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            </div>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="media">Media</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                {place.description && (
                  <div>
                    <h4 className="font-medium text-sm mb-1">Description</h4>
                    <p className="text-sm text-muted-foreground">{place.description}</p>
                  </div>
                )}

                {place.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{place.address}</p>
                  </div>
                )}

                {place.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <a
                      href={place.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline truncate"
                    >
                      {place.website}
                    </a>
                  </div>
                )}

                {place.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <a href={`tel:${place.phone}`} className="text-sm hover:underline">
                      {place.phone}
                    </a>
                  </div>
                )}

                {place.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <a href={`mailto:${place.email}`} className="text-sm hover:underline">
                      {place.email}
                    </a>
                  </div>
                )}

                {place.hours && (
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      {Object.entries(place.hours as Record<string, string>).map(([day, time]) => (
                        <div key={day}><span className="capitalize">{day}</span>: {time}</div>
                      ))}
                    </div>
                  </div>
                )}

                {(place.tags && place.tags.length > 0) && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-1">
                      {(place.tags as string[]).map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {(place.vibes && place.vibes.length > 0) && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Vibes</h4>
                    <div className="flex flex-wrap gap-1">
                      {(place.vibes as string[]).map(vibe => (
                        <Badge key={vibe} variant="secondary" className="text-xs">
                          {vibe}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="details" className="space-y-4 mt-4">
                {place.notes && (
                  <div>
                    <h4 className="font-medium text-sm mb-1">Notes</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{place.notes}</p>
                  </div>
                )}

                {place.practicalInfo && (
                  <div>
                    <h4 className="font-medium text-sm mb-1">Practical Info</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{place.practicalInfo}</p>
                  </div>
                )}

                {place.best_time && (
                  <div>
                    <h4 className="font-medium text-sm mb-1">Best Time to Visit</h4>
                    <p className="text-sm text-muted-foreground">{place.best_time}</p>
                  </div>
                )}

                {place.price_level && (
                  <div>
                    <h4 className="font-medium text-sm mb-1">Price Level</h4>
                    <p className="text-sm">{place.price_level}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="media" className="mt-4">
                {place.attachments && place.attachments.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {place.attachments.map(attachment => (
                      <div key={attachment.id} className="aspect-square rounded-md overflow-hidden bg-muted">
                        <img
                          src={attachment.uri}
                          alt={attachment.filename || 'Attachment'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No media attachments
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
