import type { Place, Collection, DayBucket } from './database'

export interface MapPlace extends Place {
  isSelected?: boolean
  isHovered?: boolean
  dayNumber?: number
}

export interface MapFilters {
  collectionId: string | null
  kinds: string[]
  search: string
  showUnvisitedOnly: boolean
  showDayOverlay: boolean
  activeDays: number[]
}

export interface MapViewportState {
  latitude: number
  longitude: number
  zoom: number
}

export interface MapState {
  selectedPlaceId: string | null
  hoveredPlaceId: string | null
  filters: MapFilters
  viewportState: MapViewportState
}

export interface MapActions {
  selectPlace: (id: string | null) => void
  hoverPlace: (id: string | null) => void
  updateFilters: (filters: Partial<MapFilters>) => void
  fitBounds: () => void
  flyTo: (lng: number, lat: number) => void
}

export interface PlaceFeatureProperties {
  id: string
  name: string
  kind: string
  city: string | null
  country: string | null
  dayNumber?: number
}

export interface MapPageProps {
  places: Place[]
  collections: Collection[]
}

export interface MapContextValue {
  places: MapPlace[]
  filteredPlaces: MapPlace[]
  collections: Collection[]
  selectedPlaceId: string | null
  hoveredPlaceId: string | null
  filters: MapFilters
  selectPlace: (id: string | null) => void
  hoverPlace: (id: string | null) => void
  updateFilters: (filters: Partial<MapFilters>) => void
  fitBounds: () => void
  flyTo: (lng: number, lat: number) => void
  setMapRef: (ref: any) => void
  listRef: React.RefObject<HTMLDivElement> | null
  scrollToPlace: (id: string) => void
}

export interface DayLookup {
  placeId: string
  dayNumber: number
}
