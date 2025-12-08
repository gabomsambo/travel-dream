"use client"

import * as React from "react"
import { Filter, X, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useIsMobile } from "@/components/ui-v2/use-mobile"

export interface LibraryFilters {
  kinds: Set<string>
  vibes: Set<string>
  tags: Set<string>
  rating: number
  visitStatus: Set<string>
  hasPhotosOnly: boolean
}

export interface FilterOptions {
  kinds: string[]
  cities: string[]
  countries: string[]
  tags: string[]
  vibes: string[]
}

interface PlaceFiltersSidebarProps {
  filters: LibraryFilters
  filterOptions: FilterOptions
  onChange: (updates: Partial<LibraryFilters>) => void
  onClear: () => void
}

const visitStatusOptions = [
  { value: "not_visited", label: "Not Visited" },
  { value: "visited", label: "Visited" },
  { value: "planned", label: "Planned" },
]

export function PlaceFiltersSidebar({
  filters,
  filterOptions,
  onChange,
  onClear,
}: PlaceFiltersSidebarProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)

  const toggleKind = (kind: string) => {
    const newKinds = filters.kinds instanceof Set ? new Set(filters.kinds) : new Set<string>()
    if (newKinds.has(kind)) {
      newKinds.delete(kind)
    } else {
      newKinds.add(kind)
    }
    onChange({ kinds: newKinds })
  }

  const toggleVibe = (vibe: string) => {
    const newVibes = filters.vibes instanceof Set ? new Set(filters.vibes) : new Set<string>()
    if (newVibes.has(vibe)) {
      newVibes.delete(vibe)
    } else {
      newVibes.add(vibe)
    }
    onChange({ vibes: newVibes })
  }

  const toggleVisitStatus = (status: string) => {
    const newStatus = filters.visitStatus instanceof Set ? new Set(filters.visitStatus) : new Set<string>()
    if (newStatus.has(status)) {
      newStatus.delete(status)
    } else {
      newStatus.add(status)
    }
    onChange({ visitStatus: newStatus })
  }

  const activeFilterCount =
    (filters.kinds instanceof Set ? filters.kinds.size : 0) +
    (filters.vibes instanceof Set ? filters.vibes.size : 0) +
    (filters.rating > 0 ? 1 : 0) +
    (filters.visitStatus instanceof Set ? filters.visitStatus.size : 0) +
    (filters.hasPhotosOnly ? 1 : 0)

  const filterContent = (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        {/* Active Filters Summary */}
        {activeFilterCount > 0 && (
          <div className="flex items-center justify-between">
            <Badge variant="secondary">{activeFilterCount} active</Badge>
            <Button variant="ghost" size="sm" onClick={onClear} className="h-8 text-xs">
              Clear all
            </Button>
          </div>
        )}

        {/* Place Types */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Place Type</h4>
          <div className="grid grid-cols-2 gap-3">
            {filterOptions.kinds.slice(0, 12).map((kind) => (
              <div key={kind} className="flex items-center space-x-2">
                <Checkbox
                  id={`kind-${kind}`}
                  checked={filters.kinds instanceof Set && filters.kinds.has(kind)}
                  onCheckedChange={() => toggleKind(kind)}
                />
                <Label
                  htmlFor={`kind-${kind}`}
                  className="text-sm font-normal cursor-pointer capitalize"
                >
                  {kind}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Vibes */}
        {filterOptions.vibes.length > 0 && (
          <>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Vibes</h4>
              <div className="flex flex-wrap gap-2">
                {filterOptions.vibes.map((vibe) => (
                  <Badge
                    key={vibe}
                    variant={filters.vibes instanceof Set && filters.vibes.has(vibe) ? "default" : "outline"}
                    className="cursor-pointer capitalize"
                    onClick={() => toggleVibe(vibe)}
                  >
                    {vibe}
                  </Badge>
                ))}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Rating Filter */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Minimum Rating</h4>
          <div className="flex flex-wrap gap-1">
            {[0, 1, 2, 3, 4, 5].map((ratingValue) => (
              <Button
                key={ratingValue}
                variant={filters.rating === ratingValue ? "default" : "outline"}
                size="sm"
                onClick={() => onChange({ rating: ratingValue })}
                className="gap-1"
              >
                {ratingValue === 0 ? "All" : ratingValue}
                {ratingValue > 0 && <Star className="h-3 w-3" />}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Visit Status */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Visit Status</h4>
          <div className="space-y-2">
            {visitStatusOptions.map((status) => (
              <div key={status.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`status-${status.value}`}
                  checked={filters.visitStatus instanceof Set && filters.visitStatus.has(status.value)}
                  onCheckedChange={() => toggleVisitStatus(status.value)}
                />
                <Label
                  htmlFor={`status-${status.value}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {status.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Has Photos Only */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="has-photos"
            checked={filters.hasPhotosOnly}
            onCheckedChange={(checked) => onChange({ hasPhotosOnly: !!checked })}
          />
          <Label htmlFor="has-photos" className="text-sm font-normal cursor-pointer">
            Has Photos
          </Label>
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
    <div className="w-64 rounded-xl border bg-card sticky top-6 h-[calc(100vh-120px)] flex flex-col">
      <div className="flex items-center justify-between border-b p-4 shrink-0">
        <h3 className="font-semibold">Filters</h3>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-8 px-2 text-xs">
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {filterContent}
      </div>
    </div>
  )
}
