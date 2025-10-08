"use client"

import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface ActiveFilterChipsProps {
  filters: Record<string, any>
  onRemoveFilter: (key: string) => void
  className?: string
}

export function ActiveFilterChips({
  filters,
  onRemoveFilter,
  className
}: ActiveFilterChipsProps) {
  const activeFilters = Object.entries(filters).filter(([key, value]) => {
    if (key === 'search') return value !== ''
    if (key === 'tags' || key === 'vibes') {
      return value instanceof Set && value.size > 0
    }
    return value !== 'all' && value !== null && value !== undefined
  })

  if (activeFilters.length === 0) {
    return null
  }

  const formatFilterLabel = (key: string): string => {
    return key.charAt(0).toUpperCase() + key.slice(1)
  }

  const formatFilterValue = (key: string, value: any): string => {
    if (key === 'tags' || key === 'vibes') {
      return Array.from(value as Set<string>).join(', ')
    }
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
