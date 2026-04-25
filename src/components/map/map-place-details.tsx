"use client"

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, ExternalLink, Clock, Globe, Phone, Mail, Navigation } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KindBadge } from '@/components/ui/kind-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMapContext } from './map-context'
import { AddressLink } from './address-link'
import type { Attachment, PlaceWithRelations } from '@/types/database'
import { FindImageButton } from '@/components/places/find-image-button'
import { PhotoAttribution } from '@/components/attribution/photo-attribution'

const PhotoLightbox = dynamic(() =>
  import('@/components/ui-custom/photo-lightbox').then(mod => ({ default: mod.PhotoLightbox })),
  { ssr: false }
)

export function MapPlaceDetails() {
  const { selectedPlaceId, selectPlace, flyTo } = useMapContext()
  const [place, setPlace] = useState<PlaceWithRelations | null>(null)
  const [loading, setLoading] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const photos = place?.attachments?.filter(a => a.type === 'photo') ?? []

  const handleAttachmentClick = (attachment: Attachment) => {
    if (attachment.type === 'photo') {
      const idx = photos.findIndex(p => p.id === attachment.id)
      if (idx >= 0) {
        setLightboxIndex(idx)
        setLightboxOpen(true)
      }
    } else if (attachment.uri.startsWith('https://') || attachment.uri.startsWith('http://')) {
      window.open(attachment.uri, '_blank', 'noopener,noreferrer')
    }
  }

  useEffect(() => {
    setLightboxOpen(false)
    setLightboxIndex(0)
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

            <div className="space-y-4">
              {/* Overview */}
              <section className="space-y-4">
                {place.description && (
                  <div>
                    <h4 className="font-medium text-sm mb-1">Description</h4>
                    <p className="text-sm text-muted-foreground">{place.description}</p>
                  </div>
                )}

                <AddressLink place={place} />

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
              </section>

              {/* Details */}
              {(place.notes || place.practicalInfo || place.best_time || place.price_level) && (
                <section className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Details</h3>
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
                </section>
              )}

              {/* Media */}
              <section className="space-y-3 border-t pt-4">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Media</h3>
                {photos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {photos.map(photo => (
                      <div key={photo.id} className="space-y-1">
                        <div
                          className="aspect-square rounded-md overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => handleAttachmentClick(photo)}
                        >
                          <img
                            src={photo.thumbnailUri || photo.uri}
                            alt={photo.caption || photo.filename || 'Attachment'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <PhotoAttribution attribution={photo.attribution} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
                    <p className="text-sm">No media attachments</p>
                    <FindImageButton
                      placeId={place.id}
                      placeName={place.name}
                      placeCity={place.city}
                      hasGooglePlaceId={Boolean(place.googlePlaceId)}
                      onAttached={() => {
                        if (selectedPlaceId) {
                          fetch(`/api/places/${selectedPlaceId}`)
                            .then((r) => r.ok ? r.json() : null)
                            .then((d) => d && setPlace(d))
                            .catch(() => {})
                        }
                      }}
                    />
                  </div>
                )}
              </section>
            </div>
            <PhotoLightbox
              photos={photos}
              open={lightboxOpen}
              index={lightboxIndex}
              onClose={() => setLightboxOpen(false)}
            />
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
