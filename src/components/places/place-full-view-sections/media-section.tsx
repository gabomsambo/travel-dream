"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Star, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/adapters/button"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/adapters/card"
import { PhotoUploader } from "@/components/upload/photo-uploader"
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
  const photos = place.attachments.filter(a => a.type === 'photo')

  const openLightbox = (index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  const handleUploadComplete = () => {
    window.location.reload()
  }

  const handleSetCover = async (attachmentId: string) => {
    try {
      const response = await fetch(
        `/api/places/${place.id}/attachments/${attachmentId}/primary`,
        {
          method: "PUT",
        }
      )

      if (!response.ok) {
        throw new Error("Failed to set cover image")
      }

      toast.success("Set as cover image")
      window.location.reload()
    } catch (error) {
      toast.error("Failed to set cover image")
    }
  }

  const handleDelete = async (attachmentId: string) => {
    if (!confirm("Are you sure you want to delete this photo?")) return

    try {
      const response = await fetch(
        `/api/places/${place.id}/attachments/${attachmentId}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        throw new Error("Failed to delete photo")
      }

      toast.success("Photo deleted")
      window.location.reload()
    } catch (error) {
      toast.error("Failed to delete photo")
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>📸 Media Gallery</CardTitle>
          <PhotoUploader
            placeId={place.id}
            onUploadComplete={handleUploadComplete}
            compact
          />
        </div>
      </CardHeader>
      <CardContent>
        {photos.length === 0 ? (
          <p className="text-muted-foreground text-sm">No photos yet</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {photos.map((photo, index) => {
              const isPrimary = photo.isPrimary === 1
              return (
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
                  <Button
                    variant={isPrimary ? "default" : "secondary"}
                    size="icon"
                    className={cn(
                      "absolute top-2 left-2 h-8 w-8 transition-opacity",
                      isPrimary ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!isPrimary) handleSetCover(photo.id)
                    }}
                    title={isPrimary ? "Cover image" : "Set as cover"}
                  >
                    <Star className={cn("h-4 w-4", isPrimary && "fill-current")} />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(photo.id)
                    }}
                    title="Delete photo"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
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
