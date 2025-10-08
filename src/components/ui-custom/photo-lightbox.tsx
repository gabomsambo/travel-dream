"use client"

import Lightbox from "yet-another-react-lightbox"
import "yet-another-react-lightbox/styles.css"
import type { Attachment } from "@/types/database"

interface PhotoLightboxProps {
  photos: Attachment[]
  open: boolean
  index: number
  onClose: () => void
}

export function PhotoLightbox({ photos, open, index, onClose }: PhotoLightboxProps) {
  const slides = photos.map(photo => ({
    src: photo.uri,
    title: photo.caption || photo.filename,
    description: `${photo.width}x${photo.height}`,
  }))

  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      slides={slides}
      carousel={{ preload: 2 }}
    />
  )
}
