"use client"

import { PageHeader } from "@/components/layout/page-header"
import { PlaceGrid } from "@/components/places/place-grid"
import { Button } from "@/components/ui/button"
import { SearchBar } from "@/components/search/search-bar"
import { Plus } from "lucide-react"

// Mock data for library - confirmed places
const mockLibraryPlaces = [
  {
    id: "plc_lib_1",
    name: "Casa Batlló",
    kind: "landmark",
    city: "Barcelona",
    country: "ES", 
    admin: "Catalonia",
    coords: { lat: 41.3916, lon: 2.1649 },
    address: null,
    altNames: [],
    tags: ["Gaudí", "architecture", "modernist"],
    vibes: ["artistic", "iconic"],
    ratingSelf: 5,
    notes: "Incredible facade and interior design",
    status: "library",
    confidence: 1.0,
    createdAt: "2025-09-27T00:00:00Z",
    updatedAt: "2025-09-27T00:00:00Z",
  },
  {
    id: "plc_lib_2",
    name: "La Boqueria Market",
    kind: "market",
    city: "Barcelona",
    country: "ES",
    admin: "Catalonia", 
    coords: { lat: 41.3818, lon: 2.1713 },
    address: null,
    altNames: ["Mercat de Sant Josep de la Boqueria"],
    tags: ["food", "market", "tourist"],
    vibes: ["bustling", "colorful"],
    ratingSelf: 4,
    notes: "Great for fresh fruit and jamón",
    status: "library",
    confidence: 1.0,
    createdAt: "2025-09-26T00:00:00Z",
    updatedAt: "2025-09-26T00:00:00Z",
  }
]

export default function LibraryPage() {
  return (
    <div className="space-y-6">
      <PageHeader 
        title="Library"
        description={`${mockLibraryPlaces.length} confirmed places`}
      >
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Place
        </Button>
      </PageHeader>

      {/* Search and Filters */}
      <SearchBar 
        showFilters={true}
        placeholder="Search your library..."
      />

      {/* Places Grid with virtualization support */}
      <PlaceGrid
        places={mockLibraryPlaces}
        showActions={false}
        showConfidence={false}
        emptyMessage="No places in your library yet"
        virtualizeThreshold={300} // Enable virtualization for 300+ places in library
        containerHeight={600} // Larger height for library browsing
        enablePerformanceMonitoring={process.env.NODE_ENV === 'development'}
      />
    </div>
  )
}
