"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ArrowUpDown } from "lucide-react"

type SortOption = "recent" | "most-places" | "last-edited"

interface CollectionSortDropdownProps {
  value: SortOption
  onChange: (option: SortOption) => void
}

const sortLabels: Record<SortOption, string> = {
  recent: "Recent",
  "most-places": "Most Places",
  "last-edited": "Last Edited",
}

export function CollectionSortDropdown({ value, onChange }: CollectionSortDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2">
          <ArrowUpDown className="h-4 w-4" />
          Sort
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onChange("recent")}>
          {value === "recent" && "✓ "}
          {sortLabels.recent}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange("most-places")}>
          {value === "most-places" && "✓ "}
          {sortLabels["most-places"]}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange("last-edited")}>
          {value === "last-edited" && "✓ "}
          {sortLabels["last-edited"]}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
