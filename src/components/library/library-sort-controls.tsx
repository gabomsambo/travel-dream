"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface LibrarySortControlsProps {
  sort: string
  onSortChange: (sort: string) => void
  className?: string
}

export function LibrarySortControls({
  sort,
  onSortChange,
  className
}: LibrarySortControlsProps) {
  return (
    <Select value={sort} onValueChange={onSortChange}>
      <SelectTrigger className={cn("w-full sm:w-48", className)}>
        <SelectValue placeholder="Sort by..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="date-newest">Date Added (Newest)</SelectItem>
        <SelectItem value="date-oldest">Date Added (Oldest)</SelectItem>
        <SelectItem value="rating-high">Rating (Highest)</SelectItem>
        <SelectItem value="rating-low">Rating (Lowest)</SelectItem>
        <SelectItem value="name-az">Name (A-Z)</SelectItem>
        <SelectItem value="name-za">Name (Z-A)</SelectItem>
        <SelectItem value="kind">Kind</SelectItem>
      </SelectContent>
    </Select>
  )
}
