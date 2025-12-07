"use client"

import * as React from "react"
import { Filter, X } from "lucide-react"
import type { PlaceKind, PlaceStatus } from "@/types/database"
import { Button } from "@/components/ui-v2/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui-v2/sheet"
import { Checkbox } from "@/components/ui-v2/checkbox"
import { Label } from "@/components/ui-v2/label"
import { Separator } from "@/components/ui-v2/separator"
import { Badge } from "@/components/ui-v2/badge"
import { ScrollArea } from "@/components/ui-v2/scroll-area"
import { useIsMobile } from "@/components/ui-v2/use-mobile"

export interface PlaceFilters {
  kinds: PlaceKind[]
  statuses: PlaceStatus[]
  priceLevel?: number[]
  vibes: string[]
}

interface PlaceFiltersProps {
  filters: PlaceFilters
  onChange: (filters: PlaceFilters) => void
}

const placeKinds: { value: PlaceKind; label: string }[] = [
  { value: "city", label: "City" },
  { value: "neighborhood", label: "Neighborhood" },
  { value: "landmark", label: "Landmark" },
  { value: "museum", label: "Museum" },
  { value: "gallery", label: "Gallery" },
  { value: "viewpoint", label: "Viewpoint" },
  { value: "park", label: "Park" },
  { value: "beach", label: "Beach" },
  { value: "natural", label: "Natural" },
  { value: "stay", label: "Stay" },
  { value: "hostel", label: "Hostel" },
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restaurant" },
  { value: "cafe", label: "Café" },
  { value: "bar", label: "Bar" },
  { value: "club", label: "Club" },
  { value: "market", label: "Market" },
  { value: "shop", label: "Shop" },
  { value: "experience", label: "Experience" },
  { value: "tour", label: "Tour" },
  { value: "thermal", label: "Thermal" },
  { value: "festival", label: "Festival" },
  { value: "transit", label: "Transit" },
  { value: "tip", label: "Tip" },
]

const commonVibes = [
  "serene",
  "magical",
  "stylish",
  "modern",
  "creative",
  "peaceful",
  "authentic",
  "lively",
  "secluded",
  "adventurous",
  "futuristic",
  "quirky",
  "bohemian",
  "mystical",
  "iconic",
]

export function PlaceFiltersComponent({ filters, onChange }: PlaceFiltersProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)

  const toggleKind = (kind: PlaceKind) => {
    const newKinds = filters.kinds.includes(kind) ? filters.kinds.filter((k) => k !== kind) : [...filters.kinds, kind]
    onChange({ ...filters, kinds: newKinds })
  }

  const toggleVibe = (vibe: string) => {
    const newVibes = filters.vibes.includes(vibe) ? filters.vibes.filter((v) => v !== vibe) : [...filters.vibes, vibe]
    onChange({ ...filters, vibes: newVibes })
  }

  const clearFilters = () => {
    onChange({ kinds: [], statuses: [], vibes: [] })
  }

  const activeFilterCount = filters.kinds.length + filters.statuses.length + filters.vibes.length

  const filterContent = (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        {/* Active Filters Summary */}
        {activeFilterCount > 0 && (
          <div className="flex items-center justify-between">
            <Badge variant="secondary">{activeFilterCount} active</Badge>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
              Clear all
            </Button>
          </div>
        )}

        {/* Place Types */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Place Type</h4>
          <div className="grid grid-cols-2 gap-3">
            {placeKinds.slice(0, 12).map((kind) => (
              <div key={kind.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`kind-${kind.value}`}
                  checked={filters.kinds.includes(kind.value)}
                  onCheckedChange={() => toggleKind(kind.value)}
                />
                <Label htmlFor={`kind-${kind.value}`} className="text-sm font-normal cursor-pointer">
                  {kind.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Vibes */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Vibes</h4>
          <div className="flex flex-wrap gap-2">
            {commonVibes.map((vibe) => (
              <Badge
                key={vibe}
                variant={filters.vibes.includes(vibe) ? "default" : "outline"}
                className="cursor-pointer capitalize"
                onClick={() => toggleVibe(vibe)}
              >
                {vibe}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        {/* Price Level */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Price Level</h4>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((level) => (
              <Button
                key={level}
                variant={filters.priceLevel?.includes(level) ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const current = filters.priceLevel || []
                  const newPriceLevel = current.includes(level)
                    ? current.filter((p) => p !== level)
                    : [...current, level]
                  onChange({ ...filters, priceLevel: newPriceLevel })
                }}
              >
                {"$".repeat(level)}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" className="gap-2 bg-transparent">
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[85vh]">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          {filterContent}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div className="w-64 rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="font-semibold">Filters</h3>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-xs">
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
      {filterContent}
    </div>
  )
}
