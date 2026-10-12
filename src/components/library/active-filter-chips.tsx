"use client"

import { X } from "lucide-react"
import { Badge } from "@/components/adapters/badge"
import { cn } from "@/lib/utils"

export interface ActiveFilterChipsProps {
  filters: Record<string, any>
  onRemoveFilter: (key: string) => void
  className?: string
}

const FILTER_LABELS: Record<string, string> = {
  kinds: 'Kinds',
  kind: 'Kinds',
  tags: 'Tags',
  vibes: 'Vibes',
  visitStatus: 'Visit status',
  hasPhotosOnly: 'Has photos',
  rating: 'Rating',
  city: 'City',
  country: 'Country',
  search: 'Search',
}

export function ActiveFilterChips({
  filters,
  onRemoveFilter,
  className
}: ActiveFilterChipsProps) {
  const activeFilters = Object.entries(filters).filter(([key, value]) => {
    if (value instanceof Set) return value.size > 0
    if (typeof value === 'boolean') return value
    if (key === 'search') return value !== ''
    if (key === 'rating') return typeof value === 'number' && value > 0
    return value !== 'all' && value !== null && value !== undefined && value !== ''
  })

  if (activeFilters.length === 0) {
    return null
  }

  const formatFilterLabel = (key: string): string => {
    return FILTER_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
  }

  const formatFilterValue = (key: string, value: any): string => {
    if (value instanceof Set) return Array.from(value).join(', ')
    if (Array.isArray(value)) return value.join(', ')
    if (key === 'hasPhotosOnly') return 'yes'
    return String(value)
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {activeFilters.map(([key, value]) => (
        <Badge
          key={key}
          variant="secondary"
          className="gap-1.5 cursor-pointer hover:bg-secondary/80"
          onClick={() => onRemoveFilter(key)}
        >
          <span className="text-xs">
            {formatFilterLabel(key)}: {formatFilterValue(key, value)}
          </span>
          <X className="h-3 w-3" />
        </Badge>
      ))}
    </div>
  )
}
