"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardContent } from "@/components/adapters/card"
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import { Separator } from "@/components/adapters/separator"
import { Check, X, Image as ImageIcon } from "lucide-react"
import { toast } from "sonner"
import { PlaceEditForm } from '@/components/places/place-edit-form'
import { ConfidenceIndicator } from '@/components/inbox/confidence-indicator'
import type { Place, Source } from '@/types/database'

interface ReviewClientProps {
  initialPlace?: Place
  initialSources?: Source[]
  initialPlaces?: Place[]
}

export function ReviewClient({ initialPlace, initialSources = [], initialPlaces = [] }: ReviewClientProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (initialPlace) {
    const primarySource = initialSources[0]

    const handleSave = async (updates: Partial<Place>) => {
      setIsSubmitting(true)
      try {
        const response = await fetch(`/api/places/${initialPlace.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })

        if (!response.ok) throw new Error('Update failed')

        const result = await response.json()
        toast.success('Place updated successfully')
      } catch (error) {
        toast.error('Failed to update place')
      } finally {
        setIsSubmitting(false)
      }
    }

    const handleSaveAndConfirm = async () => {
      setIsSubmitting(true)
      try {
        const response = await fetch(`/api/places/${initialPlace.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'library' }),
        })

        if (!response.ok) throw new Error('Confirm failed')

        toast.success('Place confirmed to library')
        router.push('/library')
      } catch (error) {
        toast.error('Failed to confirm place')
        setIsSubmitting(false)
      }
    }

    const handleArchive = async () => {
      if (!confirm('Archive this place? This action can be undone from the archived view.')) return

      setIsSubmitting(true)
      try {
        const response = await fetch(`/api/places/${initialPlace.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'archived' }),
        })

        if (!response.ok) throw new Error('Archive failed')

        toast.success('Place archived')
        router.push('/inbox')
      } catch (error) {
        toast.error('Failed to archive place')
        setIsSubmitting(false)
      }
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-bold">Original Source</h2>
            <p className="text-sm text-muted-foreground">
              Screenshot and extracted text from OCR
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {primarySource?.meta?.uploadInfo?.storedPath ? (
              <div className="rounded-lg overflow-hidden border">
                <img
                  src={primarySource.meta.uploadInfo.storedPath}
                  alt="Source screenshot"
                  className="w-full h-auto"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 bg-muted rounded-lg">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">No image available</span>
              </div>
            )}

            {primarySource?.ocrText ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Extracted Text (OCR)</h3>
                  {primarySource.meta?.uploadInfo?.ocrConfidence && (
                    <Badge variant="outline">
                      {(primarySource.meta.uploadInfo.ocrConfidence * 100).toFixed(0)}% confidence
                    </Badge>
                  )}
                </div>
                <div className="bg-muted p-4 rounded-lg max-h-96 overflow-y-auto">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">
                    {primarySource.ocrText}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No OCR text available
              </div>
            )}

            {primarySource && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Source ID: {primarySource.id}</p>
                {primarySource.meta?.uploadInfo?.filename && (
                  <p>Filename: {primarySource.meta.uploadInfo.filename}</p>
                )}
                {primarySource.createdAt && (
                  <p>Uploaded: {new Date(primarySource.createdAt).toLocaleString()}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Extracted Place</h2>
              <ConfidenceIndicator
                confidence={initialPlace.confidence || 0}
                variant="badge"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Edit any fields below and save changes
            </p>
          </CardHeader>
          <CardContent>
            <PlaceEditForm
              place={initialPlace}
              onSave={handleSave}
              onCancel={() => router.push('/inbox')}
              isSubmitting={isSubmitting}
            />

            <Separator className="my-6" />

            <div className="flex gap-3">
              <Button
                onClick={handleSaveAndConfirm}
                disabled={isSubmitting}
                className="flex-1"
              >
                <Check className="h-4 w-4 mr-2" />
                Save & Confirm to Library
              </Button>
              <Button
                onClick={handleArchive}
                disabled={isSubmitting}
                variant="outline"
              >
                <X className="h-4 w-4 mr-2" />
                Archive
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {initialPlaces.length} places in inbox. Click a place to review and edit.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {initialPlaces.map(place => (
          <Card
            key={place.id}
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => router.push(`/review?placeId=${place.id}`)}
          >
            <CardHeader>
              <h3 className="font-semibold">{place.name}</h3>
              <p className="text-sm text-muted-foreground">
                {[place.city, place.country].filter(Boolean).join(', ')}
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{place.kind}</Badge>
                <ConfidenceIndicator
                  confidence={place.confidence || 0}
                  variant="badge"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
