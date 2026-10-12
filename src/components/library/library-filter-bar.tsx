"use client"

import * as React from "react"
import { Bookmark, Check, ChevronDown, Search, SlidersHorizontal, Star, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/adapters/popover"
import { kindLabel } from "@/components/explore/kind-icon"
import { flagFor } from "@/lib/explore/geo"
import { normalize } from "@/lib/library/search"
import {
  MONTH_NAMES, panelFilterCount, type Facet, type LibraryFilterState, type PhotoFilter,
} from "@/lib/library/filters"
import { LibrarySheet } from "./library-sheet"

/** Every value each facet can take in this library, and the country a city is in. */
export interface FilterOptions {
  countries: string[]
  cities: Array<{ city: string; country: string | null }>
  kinds: string[]
  tags: string[]
  vibes: string[]
}

export type UpdateFilters = (patch: Partial<LibraryFilterState>) => void

const pill =
  "inline-flex h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border bg-background px-2.5 text-xs font-medium outline-none transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-secondary"
const pillOn = "border-foreground/70 bg-foreground/[0.06]"

function toggleIn<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return next
}

interface ListOption {
  value: string
  label: string
  count: number
  prefix?: string
  group?: string
}

/**
 * A searchable checkbox list: most places first, zeros dimmed at the bottom,
 * the values you've picked always shown. Long taxonomies (118 vibes) show the
 * top dozen until you search.
 */
function FacetList({
  label,
  options,
  selected,
  onToggle,
  onClear,
  limit = 12,
  autoFocus = true,
}: {
  label: string
  options: ListOption[]
  selected: Set<string>
  onToggle: (v: string) => void
  onClear: () => void
  limit?: number
  autoFocus?: boolean
}) {
  const [q, setQ] = React.useState("")
  const [all, setAll] = React.useState(false)
  const needle = normalize(q)
  const matched = needle ? options.filter((o) => normalize(o.label).includes(needle)) : options
  const ranked = [...matched].sort(
    (a, b) =>
      Number(selected.has(b.value)) - Number(selected.has(a.value)) ||
      Number(b.count > 0) - Number(a.count > 0) ||
      (a.group ?? "").localeCompare(b.group ?? "") ||
      b.count - a.count ||
      a.label.localeCompare(b.label)
  )
  // Zero-count values are dead ends with the other filters on: tucked behind "Show all" until searched for.
  const live = ranked.filter((o) => o.count > 0 || selected.has(o.value))
  const shown = needle || all ? ranked : live.slice(0, limit)
  const searchable = options.length > 8
  let lastGroup: string | undefined

  return (
    <div className="flex min-h-0 flex-col">
      {searchable && (
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Find a ${label.toLowerCase()}…`}
            aria-label={`Find a ${label.toLowerCase()}`}
            autoFocus={autoFocus}
            className="h-9 w-full rounded-lg border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      )}
      <div role="group" aria-label={label} className="min-h-0 overflow-y-auto overflow-x-hidden">
        {shown.map((o) => {
          const on = selected.has(o.value)
          const header = o.group !== undefined && o.group !== lastGroup ? o.group : null
          lastGroup = o.group
          return (
            <React.Fragment key={o.value}>
              {header && <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{header}</p>}
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle(o.value)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-secondary focus-visible:bg-secondary",
                  o.count === 0 && !on && "text-muted-foreground/70"
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                  )}
                  aria-hidden
                >
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                {o.prefix && <span aria-hidden>{o.prefix}</span>}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{o.count}</span>
              </button>
            </React.Fragment>
          )
        })}
        {!shown.length && (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {needle ? `No ${label.toLowerCase()} matches “${q}”.` : `No ${label.toLowerCase()} fits the other filters.`}
          </p>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2 border-t pt-2 text-xs">
        {!needle && (ranked.length > shown.length || all) && ranked.length > Math.min(live.length, limit) && (
          <button type="button" onClick={() => setAll((v) => !v)} className="font-medium text-primary hover:underline">
            {all ? "Show fewer" : `Show all ${ranked.length}`}
          </button>
        )}
        {selected.size > 0 && (
          <button type="button" onClick={onClear} className="ml-auto text-muted-foreground hover:text-foreground">
            Clear {label.toLowerCase()}
          </button>
        )}
      </div>
    </div>
  )
}

function MonthGrid({ selected, counts, onToggle }: { selected: Set<number>; counts: Map<string, number>; onToggle: (m: number) => void }) {
  return (
    <div role="group" aria-label="Best month to go" className="grid grid-cols-3 gap-1.5">
      {MONTH_NAMES.map((name, i) => {
        const m = i + 1
        const on = selected.has(m)
        const n = counts.get(String(m)) ?? 0
        return (
          <button
            key={name}
            type="button"
            role="checkbox"
            aria-checked={on}
            aria-label={`${name}, ${n} places`}
            onClick={() => onToggle(m)}
            className={cn(
              "flex flex-col items-center rounded-xl border px-2 py-2 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
              on ? "border-transparent bg-foreground text-background" : "hover:bg-secondary",
              !on && n === 0 && "text-muted-foreground/60"
            )}
          >
            <span className="font-semibold">{name.slice(0, 3)}</span>
            <span className={cn("text-[10px]", on ? "opacity-70" : "text-muted-foreground")}>{n}</span>
          </button>
        )
      })}
      <p className="col-span-3 mt-1 text-[11px] text-muted-foreground">From the best-time notes. Places good all year count in every month.</p>
    </div>
  )
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string; hint?: string }>
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-secondary focus-visible:bg-secondary"
        >
          <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", value === o.value ? "border-primary" : "border-muted-foreground/40")} aria-hidden>
            {value === o.value && <span className="h-2 w-2 rounded-full bg-primary" />}
          </span>
          <span className="flex-1">{o.label}</span>
          {o.hint && <span className="text-xs tabular-nums text-muted-foreground">{o.hint}</span>}
        </button>
      ))}
    </div>
  )
}

const STATUSES = [
  { value: "not_visited", label: "Dreaming" },
  { value: "planned", label: "Planned" },
  { value: "visited", label: "Been" },
]

function MoreFilters({ filters, update }: { filters: LibraryFilterState; update: UpdateFilters }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your rating</p>
        <div role="radiogroup" aria-label="Minimum rating" className="flex flex-wrap gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={filters.rating === n}
              onClick={() => update({ rating: n })}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filters.rating === n ? "border-transparent bg-foreground text-background" : "hover:bg-secondary"
              )}
            >
              {n === 0 ? "Any" : <>{n}<Star className="h-3 w-3 fill-current" />{n < 5 ? "+" : ""}</>}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Visit status (any mix)</p>
        {STATUSES.map((s) => {
          const on = filters.visitStatus.has(s.value)
          return (
            <button
              key={s.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => update({ visitStatus: toggleIn(filters.visitStatus, s.value), hearts: false })}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-secondary focus-visible:bg-secondary"
            >
              <span className={cn("flex h-4 w-4 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")} aria-hidden>
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type CountsFor = (facet: Facet) => Map<string, number>

/** The options a facet's list shows, with live counts. */
export function facetListOptions(facet: Exclude<Facet, "months" | "photo">, options: FilterOptions, counts: Map<string, number>, filters: LibraryFilterState): ListOption[] {
  switch (facet) {
    case "countries":
      return options.countries.map((c) => ({ value: c, label: c, prefix: flagFor(c) || undefined, count: counts.get(c) ?? 0 }))
    case "cities": {
      // With countries picked, their cities come first, grouped under each country.
      const picked = filters.countries
      return options.cities.map(({ city, country }) => ({
        value: city,
        label: city,
        count: counts.get(city) ?? 0,
        group: picked.size ? (country && picked.has(country) ? country : "Elsewhere") : undefined,
      }))
    }
    case "kinds":
      return options.kinds.map((k) => ({ value: k, label: kindLabel(k), count: counts.get(k) ?? 0 }))
    case "tags":
      return options.tags.map((t) => ({ value: t, label: `#${t}`, count: counts.get(t) ?? 0 }))
    case "vibes":
      return options.vibes.map((v) => ({ value: v, label: v.replace(/-/g, " "), count: counts.get(v) ?? 0 }))
  }
}

const FACET_PILLS: Array<{ facet: Facet | "more"; label: string }> = [
  { facet: "countries", label: "Country" },
  { facet: "cities", label: "City" },
  { facet: "kinds", label: "Kind" },
  { facet: "tags", label: "Tags" },
  { facet: "vibes", label: "Vibes" },
  { facet: "months", label: "Best month" },
  { facet: "photo", label: "Photo" },
  { facet: "more", label: "More" },
]

function activeCount(facet: Facet | "more", f: LibraryFilterState): number {
  switch (facet) {
    case "countries":
      return f.countries.size
    case "cities":
      return f.cities.size
    case "kinds":
      return f.kinds.size
    case "tags":
      return f.tags.size
    case "vibes":
      return f.vibes.size
    case "months":
      return f.months.size
    case "photo":
      return f.photo === "any" ? 0 : 1
    case "more":
      return (f.rating > 0 ? 1 : 0) + (f.visitStatus.size > 1 ? f.visitStatus.size : 0)
  }
}

/** One facet's controls, shared by the desktop popover and the phone sheet. */
export function FacetBody({
  facet,
  filters,
  update,
  options,
  countsFor,
  autoFocus = true,
}: {
  facet: Facet | "more"
  filters: LibraryFilterState
  update: UpdateFilters
  options: FilterOptions
  countsFor: CountsFor
  autoFocus?: boolean
}) {
  if (facet === "more") return <MoreFilters filters={filters} update={update} />
  const counts = countsFor(facet)
  if (facet === "months") {
    return <MonthGrid selected={filters.months} counts={counts} onToggle={(m) => update({ months: toggleIn(filters.months, m) })} />
  }
  if (facet === "photo") {
    return (
      <Choice<PhotoFilter>
        label="Photo"
        value={filters.photo}
        onChange={(photo) => update({ photo })}
        options={[
          { value: "any", label: "Any" },
          { value: "with", label: "With a photo", hint: String(counts.get("with") ?? 0) },
          { value: "without", label: "Missing a photo", hint: String(counts.get("without") ?? 0) },
        ]}
      />
    )
  }
  const label = FACET_PILLS.find((p) => p.facet === facet)!.label
  const key = facet as "countries" | "cities" | "kinds" | "tags" | "vibes"
  return (
    <FacetList
      label={label === "Tags" ? "Tag" : label === "Vibes" ? "Vibe" : label}
      options={facetListOptions(key, options, counts, filters)}
      selected={filters[key]}
      onToggle={(v) => update({ [key]: toggleIn(filters[key], v) } as Partial<LibraryFilterState>)}
      onClear={() => update({ [key]: new Set<string>() } as Partial<LibraryFilterState>)}
      autoFocus={autoFocus}
    />
  )
}

/**
 * Wide screens: one pill per facet, each opening a popover with search, counts
 * and checkboxes. Nothing is open until asked for — the old always-open wall
 * of 118 vibe chips becomes "Vibes ▾".
 */
export function LibraryFilterPills({
  filters,
  update,
  options,
  countsFor,
  firstPillRef,
}: {
  filters: LibraryFilterState
  update: UpdateFilters
  options: FilterOptions
  countsFor: CountsFor
  firstPillRef?: React.Ref<HTMLButtonElement>
}) {
  return (
    <div role="group" aria-label="Filters" className="flex items-center gap-1">
      {FACET_PILLS.map(({ facet, label }, i) => {
        if (facet === "tags" && !options.tags.length) return null
        const n = activeCount(facet, filters)
        return (
          <Popover key={facet}>
            <PopoverTrigger asChild>
              <button
                ref={i === 0 ? firstPillRef : undefined}
                type="button"
                data-library-filters={i === 0 ? "" : undefined}
                aria-keyshortcuts={i === 0 ? "f" : undefined}
                className={cn(pill, n > 0 && pillOn)}
                aria-label={n ? `${label}, ${n} selected` : label}
              >
                {label}
                {n > 0 && <span className="rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">{n}</span>}
                <ChevronDown className="hidden h-3 w-3 opacity-60 2xl:block" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className={cn("z-50 flex max-h-[min(70vh,480px)] flex-col p-3", facet === "months" ? "w-[300px]" : "w-[290px]")}
            >
              <FacetBody facet={facet} filters={filters} update={update} options={options} countsFor={countsFor} />
            </PopoverContent>
          </Popover>
        )
      })}
    </div>
  )
}

/** Narrower screens: one "Filters" pill that opens every facet in a sheet with a sticky "Show N places". */
export function LibraryFiltersSheetButton({
  filters,
  update,
  options,
  countsFor,
  shownCount,
  onClearAll,
}: {
  filters: LibraryFilterState
  update: UpdateFilters
  options: FilterOptions
  countsFor: CountsFor
  shownCount: number
  onClearAll: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const n = panelFilterCount(filters) + (filters.visitStatus.size > 1 ? filters.visitStatus.size : 0)
  return (
    <>
      <button
        type="button"
        data-library-filters=""
        aria-keyshortcuts="f"
        onClick={() => setOpen(true)}
        className={cn(pill, n > 0 && pillOn)}
        aria-label={n ? `Filters, ${n} on` : "Filters"}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
        {n > 0 && <span className="rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">{n}</span>}
      </button>
      <LibrarySheet
        open={open}
        onOpenChange={setOpen}
        title="Filters"
        description="Every change applies right away."
        wide
        footer={
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClearAll} className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Clear all
            </button>
            <button type="button" onClick={() => setOpen(false)} className="ml-auto h-11 rounded-full bg-foreground px-6 text-sm font-semibold text-background">
              Show {shownCount} {shownCount === 1 ? "place" : "places"}
            </button>
          </div>
        }
      >
        <div className="space-y-5 px-5 pb-4">
          {FACET_PILLS.map(({ facet, label }) => {
            if (facet === "tags" && !options.tags.length) return null
            return (
              <section key={facet} aria-label={label}>
                <h3 className="mb-1.5 font-heading text-sm font-semibold">{label}</h3>
                <FacetBody facet={facet} filters={filters} update={update} options={options} countsFor={countsFor} autoFocus={false} />
              </section>
            )
          })}
        </div>
      </LibrarySheet>
    </>
  )
}

export interface Chip {
  key: string
  label: string
  onRemove: () => void
}

/** "46 of 300 places", then one removable chip per active value, then Clear all. */
export function FilterChips({ chips, summary, onClearAll }: { chips: Chip[]; summary?: string; onClearAll: () => void }) {
  if (!chips.length) return null
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 hide-scrollbar sm:flex-wrap sm:px-8">
      {summary && <span className="mr-1 shrink-0 whitespace-nowrap text-xs font-medium text-muted-foreground">{summary}</span>}
      <span className="sr-only" aria-live="polite">
        {chips.length ? `${chips.length} filters on: ${chips.map((c) => c.label).join(", ")}` : "No filters"}
      </span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          aria-label={`Remove filter ${c.label}`}
          className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-secondary pl-3 pr-2 text-xs font-medium text-secondary-foreground outline-none transition hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {c.label}
          <X className="h-3 w-3 opacity-70" aria-hidden />
        </button>
      ))}
      {chips.length > 1 && (
        <button type="button" onClick={onClearAll} className="shrink-0 whitespace-nowrap px-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Clear all
        </button>
      )}
    </div>
  )
}

export function SaveViewIcon() {
  return <Bookmark className="h-3.5 w-3.5" />
}
