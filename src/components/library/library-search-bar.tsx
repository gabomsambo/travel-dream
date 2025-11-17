"use client"

import { Search, X } from "lucide-react"
import { Input } from "@/components/ui-v2/input"
import { cn } from "@/lib/utils"

interface LibrarySearchBarProps {
  className?: string
  value: string
  onChange: (value: string) => void
}

export function LibrarySearchBar({ className, value, onChange }: LibrarySearchBarProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        placeholder="Search by name, city, country, cuisine, vibe, activity, tags..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-10 pr-10 h-11"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
