"use client"

import dynamic from 'next/dynamic'

const MapboxMap = dynamic(() => import('./mapbox-map').then(mod => ({ default: mod.MapboxMap })), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    </div>
  )
})

export function MapWrapper() {
  return <MapboxMap />
}
