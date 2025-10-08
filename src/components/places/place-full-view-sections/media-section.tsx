"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PlaceWithRelations } from "@/types/database"

// Dynamic import to reduce bundle size
const PhotoLightbox = dynamic(() =>
  import("@/components/ui-custom/photo-lightbox").then(mod => ({ default: mod.PhotoLightbox })),
  { ssr: false }
)

interface MediaSectionProps {
  place: PlaceWithRelations
}

export function MediaSection({ place }: MediaSectionProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [uploading, setUploading] = useState(false)
  const photos = place.attachments.filter(a => a.type === 'photo')

  const openLightbox = (index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)

    try {
      // Upload files one at a time
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file) // CRITICAL: singular "file"

        const response = await fetch(`/api/places/${place.id}/attachments`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          throw new Error('Upload failed')
        }
      }

      window.location.reload()
    } catch (error) {
      alert('Failed to upload photos')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>📸 Media Gallery</CardTitle>
          <div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
              id="photo-upload"
              disabled={uploading}
            />
            <label htmlFor="photo-upload">
              <Button variant="outline" disabled={uploading} asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload Photos'}
                </span>
              </Button>
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {photos.length === 0 ? (
          <p className="text-muted-foreground text-sm">No photos yet</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative group"
                onClick={() => openLightbox(index)}
              >
                <img
                  src={photo.thumbnailUri || photo.uri}
                  alt={photo.caption || photo.filename}
                  className="w-full h-full object-cover"
                />
                {photo.isPrimary === 1 && (
                  <div className="absolute top-2 right-2 bg-yellow-400 text-white text-xs px-2 py-1 rounded">
                    Primary
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <PhotoLightbox
          photos={photos}
          open={lightboxOpen}
          index={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      </CardContent>
    </Card>
  )
}
