"use client"

import * as React from "react"
import { MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { kindIcon } from "@/components/explore/kind-icon"

/**
 * A static map with the place pinned, using the Mapbox access token the app
 * already ships (no new key). Rendered as a plain image so it stays light; when
 * the token is missing or the image fails, a muted placeholder keeps the card
 * shaped the same and the pin still marks the spot.
 */
export function PlaceMap({
  coords,
  kind,
  name,
  className,
}: {
  coords: { lat: number; lon: number }
  kind: string
  name: string
  className?: string
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const [failed, setFailed] = React.useState(false)
  const Icon = kindIcon(kind)

  const src = token
    ? `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${coords.lon},${coords.lat},15,0/600x400@2x?access_token=${token}`
    : null

  return (
    <div className={cn("relative h-40 overflow-hidden rounded-2xl bg-muted", className)} aria-label={`Map of ${name}`}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <MapPin className="h-8 w-8 text-muted-foreground/40" aria-hidden />
        </div>
      )}
      <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-white">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {src && !failed && <span className="absolute bottom-1.5 right-2 text-[9px] text-black/60">© Mapbox</span>}
    </div>
  )
}
