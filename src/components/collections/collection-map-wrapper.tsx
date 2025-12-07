"use client"

import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'

const CollectionMapboxMap = dynamic(
  () => import('./collection-mapbox-map').then(m => m.CollectionMapboxMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-2">
          <MapPin className="h-8 w-8 animate-pulse text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      </div>
    )
  }
)

export { CollectionMapboxMap }
