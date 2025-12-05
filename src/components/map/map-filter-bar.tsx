"use client"

import { useState, useEffect } from 'react'
import { Search, X, Maximize2, Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMapContext } from './map-context'
import { useDebounce } from '@/hooks/use-debounce'
import { getKindColor } from '@/lib/map-utils'
import { KIND_ICONS } from '@/components/places/kind-selector'
import type { PlaceKind } from '@/types/database'

const KIND_GROUPS = [
  { label: 'Food & Drink', kinds: ['restaurant', 'cafe', 'bar'] },
  { label: 'Culture', kinds: ['museum', 'gallery'] },
  { label: 'Nature', kinds: ['park', 'beach', 'natural', 'viewpoint'] },
  { label: 'Stay', kinds: ['hotel', 'hostel', 'stay'] },
  { label: 'Shopping', kinds: ['shop', 'market'] },
  { label: 'Landmarks', kinds: ['landmark', 'city'] },
] as const

export function MapFilterBar() {
  const {
    collections,
    filters,
    filteredPlaces,
    updateFilters,
    fitBounds
  } = useMapContext()

  const [searchValue, setSearchValue] = useState(filters.search)
  const debouncedSearch = useDebounce(searchValue, 300)

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      updateFilters({ search: debouncedSearch })
    }
  }, [debouncedSearch, filters.search, updateFilters])

  const handleCollectionChange = (value: string) => {
    updateFilters({
      collectionId: value === 'all' ? null : value,
      showDayOverlay: false,
      activeDays: []
    })
  }

  const toggleKind = (kind: string) => {
    const newKinds = filters.kinds.includes(kind)
      ? filters.kinds.filter(k => k !== kind)
      : [...filters.kinds, kind]
    updateFilters({ kinds: newKinds })
  }

  const clearFilters = () => {
    setSearchValue('')
    updateFilters({
      collectionId: null,
      kinds: [],
      search: '',
      showUnvisitedOnly: false,
      showDayOverlay: false,
      activeDays: []
    })
  }

  const hasActiveFilters = filters.collectionId || filters.kinds.length > 0 || filters.search || filters.showUnvisitedOnly

  return (
    <div className="border-b bg-background p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search places..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-8 h-9"
          />
          {searchValue && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => setSearchValue('')}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        <Select
          value={filters.collectionId || 'all'}
          onValueChange={handleCollectionChange}
        >
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All Collections" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Collections</SelectItem>
            {collections.map(collection => (
              <SelectItem key={collection.id} value={collection.id}>
                {collection.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => updateFilters({ showUnvisitedOnly: !filters.showUnvisitedOnly })}
          className={filters.showUnvisitedOnly ? 'bg-primary/10' : ''}
        >
          {filters.showUnvisitedOnly ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={fitBounds}
          title="Fit all places in view"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {KIND_GROUPS.map(group => (
          group.kinds.map(kind => {
            const IconComponent = KIND_ICONS[kind as PlaceKind]
            const isSelected = filters.kinds.includes(kind)
            const color = getKindColor(kind)

            return (
              <button
                key={kind}
                onClick={() => toggleKind(kind)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-colors cursor-pointer border"
                style={
                  isSelected
                    ? { backgroundColor: color, borderColor: color, color: 'white' }
                    : { backgroundColor: `${color}15`, borderColor: `${color}40`, color: color }
                }
              >
                {IconComponent && <IconComponent size={12} weight={isSelected ? 'fill' : 'regular'} />}
                <span className="capitalize">{kind}</span>
              </button>
            )
          })
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filteredPlaces.length} places</span>
        {filters.kinds.length > 0 && (
          <button
            onClick={() => updateFilters({ kinds: [] })}
            className="hover:text-foreground"
          >
            Clear kinds
          </button>
        )}
      </div>
    </div>
  )
}
