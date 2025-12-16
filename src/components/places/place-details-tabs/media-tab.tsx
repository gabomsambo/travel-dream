"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { X, Image as ImageIcon, Star } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/adapters/button"
import { Card } from "@/components/adapters/card"
import { PhotoUploader } from "@/components/upload/photo-uploader"
import type { PlaceWithRelations } from "@/types/database"

const PhotoLightbox = dynamic(() =>
  import("@/components/ui-custom/photo-lightbox").then(mod => ({ default: mod.PhotoLightbox })),
  { ssr: false }
)

interface MediaTabProps {
  place: PlaceWithRelations
  onUpdate?: () => Promise<void>
}

export function MediaTab({ place, onUpdate }: MediaTabProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const photos = place.attachments.filter((a) => a.type === "photo")

  const openLightbox = (index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  const handleUploadComplete = () => {
    // Refresh the page to show new photos
    window.location.reload()
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

      window.location.reload()
    } catch (error) {
      alert("Failed to delete photo")
    }
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

  return (
    <div className="space-y-6">
      <PhotoUploader
        placeId={place.id}
        onUploadComplete={handleUploadComplete}
      />

      {photos.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <ImageIcon className="mx-auto h-12 w-12 mb-2 opacity-30" />
          <p>No photos yet. Upload some to get started!</p>
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {photos.map((photo, index) => {
            const isPrimary = photo.isPrimary === 1
            return (
              <Card key={photo.id} className="overflow-hidden group relative">
                <div
                  className="cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => openLightbox(index)}
                >
                  <img
                    src={photo.thumbnailUri || photo.uri}
                    alt={photo.caption || photo.filename}
                    className="w-full h-48 object-cover"
                  />
                </div>
                {photo.caption && (
                  <div className="p-2 text-xs text-muted-foreground">
                    {photo.caption}
                  </div>
                )}
                <Button
                  variant={isPrimary ? "default" : "secondary"}
                  size="icon"
                  className={`absolute top-2 left-2 h-8 w-8 transition-opacity ${
                    isPrimary ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!isPrimary) handleSetCover(photo.id)
                  }}
                  title={isPrimary ? "Cover image" : "Set as cover"}
                >
                  <Star className={`h-4 w-4 ${isPrimary ? "fill-current" : ""}`} />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100
                    transition-opacity h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(photo.id)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </Card>
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
    </div>
  )
}
