"use client"

import * as React from "react"
import { Search, X, Star, Image } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface LibraryFiltersProps {
  // Filter state
  filters: {
    search: string
    kind: string
    city: string
    country: string
    tags: Set<string>
    vibes: Set<string>
    rating: number
    visitStatus: Set<string>
    hasPhotosOnly: boolean
  }

  // Available filter options (from actual library data)
  filterOptions: {
    kinds: string[]
    cities: string[]
    countries: string[]
    tags: string[]
    vibes: string[]
  }

  // Change handlers
  onFilterChange: (updates: {
    search?: string
    kind?: string
    city?: string
    country?: string
    tags?: Set<string>
    vibes?: Set<string>
    rating?: number
    visitStatus?: Set<string>
    hasPhotosOnly?: boolean
  }) => void

  onClearFilters: () => void

  className?: string
}

export function LibraryFilters({
  filters,
  filterOptions,
  onFilterChange,
  onClearFilters,
  className
}: LibraryFiltersProps) {
  const handleSearchChange = (value: string) => {
    onFilterChange({ search: value })
  }

  const toggleTag = (tag: string) => {
    const newTags = new Set(filters.tags)
    if (newTags.has(tag)) {
      newTags.delete(tag)
    } else {
      newTags.add(tag)
    }
    onFilterChange({ tags: newTags })
  }

  const toggleVibe = (vibe: string) => {
    const newVibes = new Set(filters.vibes)
    if (newVibes.has(vibe)) {
      newVibes.delete(vibe)
    } else {
      newVibes.add(vibe)
    }
    onFilterChange({ vibes: newVibes })
  }

  const toggleVisitStatus = (status: string) => {
    const newVisitStatus = new Set(filters.visitStatus)
    if (newVisitStatus.has(status)) {
      newVisitStatus.delete(status)
    } else {
      newVisitStatus.add(status)
    }
    onFilterChange({ visitStatus: newVisitStatus })
  }

  // Check if any filters are active
  const hasActiveFilters =
    filters.search !== '' ||
    filters.kind !== 'all' ||
    filters.city !== 'all' ||
    filters.country !== 'all' ||
    filters.tags.size > 0 ||
    filters.vibes.size > 0 ||
    filters.rating > 0 ||
    filters.visitStatus.size > 0 ||
    filters.hasPhotosOnly

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search and Dropdown Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search places..."
            className="pl-9"
          />
        </div>

        {/* Kind Filter */}
        <Select
          value={filters.kind}
          onValueChange={(v) => onFilterChange({ kind: v })}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All Kinds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Kinds</SelectItem>
            {filterOptions.kinds.map(kind => (
              <SelectItem key={kind} value={kind}>
                {kind}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* City Filter */}
        <Select
          value={filters.city}
          onValueChange={(v) => onFilterChange({ city: v })}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All Cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cities</SelectItem>
            {filterOptions.cities.map(city => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Country Filter */}
        <Select
          value={filters.country}
          onValueChange={(v) => onFilterChange({ country: v })}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All Countries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {filterOptions.countries.map(country => (
              <SelectItem key={country} value={country}>
                {country}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rating Filter */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Minimum Rating
        </label>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4, 5].map(rating => (
            <Button
              key={rating}
              variant={filters.rating === rating ? "default" : "outline"}
              size="sm"
              onClick={() => onFilterChange({ rating })}
              className="gap-1"
            >
              {rating === 0 ? 'All' : rating}
              {rating > 0 && (
                <Star
                  className={cn(
                    "h-3 w-3",
                    filters.rating === rating && "fill-current"
                  )}
                />
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Visit Status Filter */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Visit Status
        </label>
        <div className="flex flex-wrap gap-2">
          {['not_visited', 'planned', 'visited'].map(status => (
            <Badge
              key={status}
              variant={filters.visitStatus.has(status) ? "default" : "outline"}
              className="cursor-pointer transition-colors hover:bg-accent"
              onClick={() => toggleVisitStatus(status)}
            >
              {status === 'not_visited' ? 'Not Visited' :
               status === 'planned' ? 'Planned' : 'Visited'}
              {filters.visitStatus.has(status) && (
                <X className="ml-1 h-3 w-3" />
              )}
            </Badge>
          ))}
        </div>
      </div>

      {/* Has Photos Filter */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="has-photos"
          checked={filters.hasPhotosOnly}
          onCheckedChange={(checked) =>
            onFilterChange({ hasPhotosOnly: checked === true })
          }
        />
        <label
          htmlFor="has-photos"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed
          peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
        >
          <Image className="h-4 w-4" />
          Only show places with photos
        </label>
      </div>

      {/* Tag Multi-Select */}
      {filterOptions.tags.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Tags</label>
          <div className="flex flex-wrap gap-2">
            {filterOptions.tags.map(tag => (
              <Badge
                key={tag}
                variant={filters.tags.has(tag) ? "default" : "outline"}
                className="cursor-pointer transition-colors hover:bg-accent"
                onClick={() => toggleTag(tag)}
              >
                {tag}
                {filters.tags.has(tag) && (
                  <X className="ml-1 h-3 w-3" />
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Vibe Multi-Select */}
      {filterOptions.vibes.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Vibes</label>
          <div className="flex flex-wrap gap-2">
            {filterOptions.vibes.map(vibe => (
              <Badge
                key={vibe}
                variant={filters.vibes.has(vibe) ? "default" : "outline"}
                className="cursor-pointer transition-colors hover:bg-accent bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                onClick={() => toggleVibe(vibe)}
              >
                {vibe}
                {filters.vibes.has(vibe) && (
                  <X className="ml-1 h-3 w-3" />
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-muted-foreground"
          >
            <X className="mr-2 h-4 w-4" />
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  )
}
