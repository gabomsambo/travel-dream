"use client"

import Lightbox from "yet-another-react-lightbox"
import Captions from "yet-another-react-lightbox/plugins/captions"
import "yet-another-react-lightbox/styles.css"
import "yet-another-react-lightbox/plugins/captions.css"
import type { Attachment } from "@/types/database"
import { PhotoAttribution } from "@/components/attribution/photo-attribution"
import { PoweredByGoogle } from "@/components/attribution/powered-by-google"

interface PhotoLightboxProps {
  photos: Attachment[]
  open: boolean
  index: number
  onClose: () => void
}

export function PhotoLightbox({ photos, open, index, onClose }: PhotoLightboxProps) {
  const slides = photos.map((photo) => {
    const hasCredit = photo.attribution && photo.attribution.kind !== "upload"
    const description =
      hasCredit || photo.source === "google_places"
        ? (
            <div className="flex flex-wrap items-center justify-center gap-2 text-left">
              {hasCredit && (
                <PhotoAttribution
                  attribution={photo.attribution}
                  className="!mt-0 !text-inherit [&_a]:text-inherit [&_a]:underline"
                />
              )}
              {photo.source === "google_places" && (
                <span className="rounded bg-background/90 px-1.5 py-0.5">
                  <PoweredByGoogle />
                </span>
              )}
            </div>
          )
        : undefined

    return {
      src: photo.uri,
      title: photo.caption || photo.filename,
      description,
    }
  })

  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Captions]}
      captions={{ descriptionTextAlign: "center" }}
      carousel={{ preload: 2 }}
    />
  )
}
