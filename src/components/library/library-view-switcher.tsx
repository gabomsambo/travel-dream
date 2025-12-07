"use client"

import { Grid3x3, List } from "lucide-react"
import { Button } from "@/components/adapters/button"
import { cn } from "@/lib/utils"

export interface LibraryViewSwitcherProps {
  view: 'grid' | 'list'
  onViewChange: (view: 'grid' | 'list') => void
  className?: string
}

export function LibraryViewSwitcher({
  view,
  onViewChange,
  className
}: LibraryViewSwitcherProps) {
  return (
    <div className={cn("flex gap-1 rounded-md border p-1", className)}>
      <Button
        variant={view === 'grid' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('grid')}
        className="gap-2"
      >
        <Grid3x3 className="h-4 w-4" />
        <span className="hidden sm:inline">Grid</span>
      </Button>
      <Button
        variant={view === 'list' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('list')}
        className="gap-2"
      >
        <List className="h-4 w-4" />
        <span className="hidden sm:inline">List</span>
      </Button>
    </div>
  )
}
