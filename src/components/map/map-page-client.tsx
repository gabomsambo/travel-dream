"use client"

import type { Place, Collection } from '@/types/database'
import { MapProvider, useMapContext } from './map-context'
import { MapWrapper } from './map-wrapper'
import { MapPlaceList } from './map-place-list'
import { MapFilterBar } from './map-filter-bar'
import { MapPlaceDetails } from './map-place-details'
import { MapDayOverlay } from './map-day-overlay'
import { useIsDesktop } from '@/hooks/use-media-query'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui-v2/resizable'

interface MapPageClientProps {
  places: Place[]
  collections: Collection[]
}

function MapRightPanel() {
  const { selectedPlaceId } = useMapContext()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {selectedPlaceId ? (
        <MapPlaceDetails />
      ) : (
        <>
          <MapFilterBar />
          <div className="flex-1 overflow-hidden">
            <MapPlaceList />
          </div>
          <MapDayOverlay />
        </>
      )}
    </div>
  )
}

function MapLayout() {
  const isDesktop = useIsDesktop()

  if (isDesktop) {
    return (
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={70} minSize={40}>
            <div className="h-full">
              <MapWrapper />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
            <div className="h-full border-l">
              <MapRightPanel />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-1/2 border-b">
        <MapRightPanel />
      </div>
      <div className="h-1/2">
        <MapWrapper />
      </div>
    </div>
  )
}

export function MapPageClient({ places, collections }: MapPageClientProps) {
  return (
    <MapProvider initialPlaces={places} collections={collections}>
      {/* Negative margins cancel out the parent p-6 padding for full-bleed map */}
      <div className="-m-6 h-[calc(100vh-4rem)] flex flex-col">
        <MapLayout />
      </div>
    </MapProvider>
  )
}
