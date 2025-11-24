"use client"

import { useState, useEffect } from 'react'
import { X, ExternalLink, MapPin, Clock, Globe, Phone, Mail } from 'lucide-react'
import Link from 'next/link'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMapContext } from './map-context'
import { getKindColor } from '@/lib/map-utils'
import type { PlaceWithRelations } from '@/types/database'

export function MapPlaceDrawer() {
  const { selectedPlaceId, selectPlace } = useMapContext()
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

  const handleClose = () => {
    selectPlace(null)
  }

  const kindColor = place ? getKindColor(place.kind) : '#64748b'

  return (
    <Sheet open={!!selectedPlaceId} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent className="w-[450px] sm:max-w-[450px] p-0 overflow-hidden">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-start justify-between">
            <div className="flex-1 pr-8">
              <SheetTitle className="text-lg font-semibold">
                {loading ? 'Loading...' : place?.name || 'Place Details'}
              </SheetTitle>
              {place && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant="secondary"
                    className="text-xs"
                    style={{ backgroundColor: `${kindColor}20`, color: kindColor }}
                  >
                    {place.kind}
                  </Badge>
                  {(place.city || place.country) && (
                    <span className="text-sm text-muted-foreground">
                      {[place.city, place.country].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {place && (
                <Link href={`/place/${place.id}`}>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {place && !loading && (
          <div className="flex-1 overflow-auto">
            <Tabs defaultValue="overview" className="h-full">
              <TabsList className="w-full justify-start rounded-none border-b px-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="media">Media</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="p-4 space-y-4 mt-0">
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

              <TabsContent value="details" className="p-4 space-y-4 mt-0">
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

              <TabsContent value="media" className="p-4 mt-0">
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
        )}

        {loading && (
          <div className="flex items-center justify-center h-48">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
