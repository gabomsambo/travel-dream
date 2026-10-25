"use client"

import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { citiesOf } from "@/lib/library/chapters"
import type { LibraryItem } from "@/lib/library/types"

/** "All 16 · Kyoto 7 · Tokyo 7 · Osaka 2" inside a country chapter. */
export function CityChips({ items, city, onCity }: { items: LibraryItem[]; city: string | null; onCity: (c: string | null) => void }) {
  const cities = citiesOf(items)
  if (cities.length < 2) return null
  const chip = "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
  const on = "border-transparent bg-foreground text-background"
  return (
    <div className="-mx-4 mb-3.5 flex gap-1.5 overflow-x-auto px-4 pb-0.5 hide-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
      <button type="button" aria-pressed={city === null} onClick={() => onCity(null)} className={cn(chip, city === null ? on : "bg-background hover:bg-secondary")}>
        All {items.length}
      </button>
      {cities.map((c) => (
        <button
          key={c.city}
          type="button"
          aria-pressed={city === c.city}
          onClick={() => onCity(city === c.city ? null : c.city)}
          className={cn(chip, city === c.city ? on : "bg-background hover:bg-secondary")}
        >
          {c.city} <span className={cn(city === c.city ? "opacity-70" : "text-muted-foreground")}>{c.count}</span>
        </button>
      ))}
    </div>
  )
}

export function MoreTile({ count, title, onClick, className }: { count: number; title: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-3 text-center text-[13px] font-medium text-muted-foreground outline-none transition hover:bg-secondary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground">
        <ChevronRight className="h-[18px] w-[18px]" />
      </span>
      {count} more{title ? ` in ${title}` : ""}
    </button>
  )
}
