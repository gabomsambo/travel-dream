"use client"

import { useState } from "react"
import { Upload, X, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import type { PlaceWithRelations } from "@/types/database"

interface MediaTabProps {
  place: PlaceWithRelations
  onUpdate?: () => Promise<void>
}

export function MediaTab({ place }: MediaTabProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const photos = place.attachments.filter((a) => a.type === "photo")

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    setUploadError(null)

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append("file", file)

        const response = await fetch(`/api/places/${place.id}/attachments`, {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || "Upload failed")
        }
      }

      window.location.reload()
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Failed to upload photos"
      )
    } finally {
      setUploading(false)
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

      window.location.reload()
    } catch (error) {
      alert("Failed to delete photo")
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-2 border-dashed rounded-lg p-6">
        <div className="text-center">
          <Upload className="mx-auto h-10 w-10 text-gray-400 mb-3" />
          <Label
            htmlFor="photo-upload"
            className="cursor-pointer text-sm font-medium"
          >
            <span className="text-blue-600 hover:text-blue-700">
              Click to upload photos
            </span>
            <span className="text-muted-foreground"> or drag and drop</span>
          </Label>
          <Input
            id="photo-upload"
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading}
          />
          <p className="text-xs text-muted-foreground mt-1">
            PNG, JPG, WebP up to 10MB each
          </p>
        </div>
      </div>

      {uploadError && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
          {uploadError}
        </div>
      )}

      {uploading && (
        <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-md">
          Uploading photos...
        </div>
      )}

      {photos.length === 0 && !uploading && (
        <div className="text-center py-8 text-muted-foreground">
          <ImageIcon className="mx-auto h-12 w-12 mb-2 opacity-30" />
          <p>No photos yet. Upload some to get started!</p>
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {photos.map((photo) => (
            <Card key={photo.id} className="overflow-hidden group relative">
              <img
                src={photo.thumbnailUri || photo.uri}
                alt={photo.caption || photo.filename}
                className="w-full h-48 object-cover"
              />
              {photo.caption && (
                <div className="p-2 text-xs text-muted-foreground">
                  {photo.caption}
                </div>
              )}
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100
                  transition-opacity h-8 w-8"
                onClick={() => handleDelete(photo.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
