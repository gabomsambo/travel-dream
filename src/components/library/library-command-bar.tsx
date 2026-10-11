"use client"

import * as React from "react"
import { ArrowLeft, Clock, Globe2, Hash, MapPin, Search, Sparkles, Tag, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { FallbackArt } from "@/components/explore/fallback-art"
import { kindLabel } from "@/components/explore/kind-icon"
import { flagFor } from "@/lib/explore/geo"
import { locationOf } from "@/lib/library/chapters"
import { FIELD_HINT, matchesWords, normalize, tokenize, type SearchHit } from "@/lib/library/search"
import type { LibraryItem } from "@/lib/library/types"
import { LibrarySheet } from "./library-sheet"

/** What a suggestion row turns the search into: a real filter on the page. */
export type SuggestionFacet = "countries" | "cities" | "kinds" | "tags" | "vibes"

export interface FacetOptions {
  countries: Array<[string, number]>
  cities: Array<[string, number]>
  kinds: Array<[string, number]>
  tags: Array<[string, number]>
  vibes: Array<[string, number]>
}

const SUGGESTION_META: Record<SuggestionFacet, { label: string; icon: LucideIcon }> = {
  countries: { label: "Country", icon: Globe2 },
  cities: { label: "City", icon: MapPin },
  kinds: { label: "Kind", icon: Tag },
  tags: { label: "Tag", icon: Hash },
  vibes: { label: "Vibe", icon: Sparkles },
}

const RECENT_KEY = "td:library-recent-searches:v1"
const RECENT_MAX = 6
const PLACE_MAX = 6
const SUGGESTION_MAX = 4

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)))
  } catch {
    /* storage blocked: recents just won't persist */
  }
}

/** The last few searches on this device — a per-viewer convenience, never account data. */
export function useRecentSearches() {
  const [recent, setRecent] = React.useState<string[]>([])
  React.useEffect(() => setRecent(readRecent()), [])
  const remember = React.useCallback((q: string) => {
    const query = q.trim()
    if (query.length < 2) return
    setRecent((prev) => {
      const next = [query, ...prev.filter((r) => r.toLowerCase() !== query.toLowerCase())].slice(0, RECENT_MAX)
      writeRecent(next)
      return next
    })
  }, [])
  const forget = React.useCallback((q: string | null) => {
    setRecent((prev) => {
      const next = q === null ? [] : prev.filter((r) => r !== q)
      writeRecent(next)
      return next
    })
  }, [])
  return { recent, remember, forget }
}

type Option =
  | { type: "place"; id: string; item: LibraryItem; hint: string | null }
  | { type: "suggestion"; id: string; facet: SuggestionFacet; value: string; count: number }
  | { type: "recent"; id: string; query: string }

const FACET_ORDER: SuggestionFacet[] = ["countries", "cities", "kinds", "tags", "vibes"]

function useOptions(query: string, hits: SearchHit[] | null, byId: Map<string, LibraryItem>, facets: FacetOptions, recent: string[]): Option[] {
  // Normalized once per library, not once per keystroke.
  const values = React.useMemo(
    () =>
      FACET_ORDER.flatMap((facet) =>
        facets[facet].map(([value, count]) => ({
          facet,
          value,
          count,
          words: [...new Set(normalize(`${facet === "kinds" ? kindLabel(value) : ""} ${value}`).split(" ").filter(Boolean))],
        }))
      ),
    [facets]
  )
  return React.useMemo(() => {
    const q = query.trim()
    if (!q) return recent.map((r, i) => ({ type: "recent" as const, id: `recent-${i}`, query: r }))
    if (q.length < 2) return []
    const places: Option[] = (hits ?? []).slice(0, PLACE_MAX).flatMap((h) => {
      const item = byId.get(h.id)
      if (!item) return []
      const hint = FIELD_HINT[h.field] ?? null
      return [{ type: "place" as const, id: `place-${h.id}`, item, hint }]
    })
    const tokens = tokenize(q)
    const suggestions: Option[] = []
    for (const v of values) {
      if (!matchesWords(tokens, v.words)) continue
      suggestions.push({ type: "suggestion", id: `s-${v.facet}-${v.value}`, facet: v.facet, value: v.value, count: v.count })
      if (suggestions.length >= SUGGESTION_MAX) break
    }
    return [...places, ...suggestions]
  }, [query, hits, byId, values, recent])
}

function Thumb({ item }: { item: LibraryItem }) {
  return (
    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
      {item.photos[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photos[0].thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <FallbackArt name={item.name} kind={item.kind} />
      )}
    </span>
  )
}

function OptionRow({ option, active, onPick, onForget }: { option: Option; active: boolean; onPick: () => void; onForget?: () => void }) {
  const base = "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-sm"
  if (option.type === "place") {
    const { item, hint } = option
    return (
      <div className={cn(base, active && "bg-secondary")} onClick={onPick}>
        <Thumb item={item} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {flagFor(item.country) && <span className="mr-1">{flagFor(item.country)}</span>}
            {[locationOf(item), kindLabel(item.kind)].filter(Boolean).join(" · ")}
            {hint && <span className="ml-1 italic">· matched {hint}</span>}
          </span>
        </span>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">Quick look ↵</span>
      </div>
    )
  }
  if (option.type === "suggestion") {
    const meta = SUGGESTION_META[option.facet]
    const label = option.facet === "kinds" ? kindLabel(option.value) : option.facet === "tags" ? `#${option.value}` : option.value
    return (
      <div className={cn(base, active && "bg-secondary")} onClick={onPick}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          {option.facet === "countries" && flagFor(option.value) ? <span className="text-lg">{flagFor(option.value)}</span> : <meta.icon className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            <span className="text-muted-foreground">{meta.label} · </span>
            <span className="font-medium">{label}</span>
          </span>
          <span className="block text-xs text-muted-foreground">
            Filter to {option.count} {option.count === 1 ? "place" : "places"}
          </span>
        </span>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">Filter ↵</span>
      </div>
    )
  }
  return (
    <div className={cn(base, "py-1.5", active && "bg-secondary")} onClick={onPick}>
      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{option.query}</span>
      {onForget && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Remove ${option.query} from recent searches`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            onForget()
          }}
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function OptionList({
  id,
  options,
  active,
  onPick,
  onForget,
  onClearRecent,
  query,
  hitCount,
}: {
  id: string
  options: Option[]
  active: number
  onPick: (o: Option) => void
  onForget: (q: string) => void
  onClearRecent: () => void
  query: string
  hitCount: number | null
}) {
  const places = options.filter((o) => o.type === "place")
  const suggestions = options.filter((o) => o.type === "suggestion")
  const recents = options.filter((o) => o.type === "recent")
  const row = (o: Option) => {
    const i = options.indexOf(o)
    return (
      <li key={o.id} id={`${id}-${o.id}`} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()}>
        <OptionRow option={o} active={i === active} onPick={() => onPick(o)} onForget={o.type === "recent" ? () => onForget(o.query) : undefined} />
      </li>
    )
  }
  const heading = "px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
  return (
    <ul id={id} role="listbox" aria-label="Search results" className="p-1.5">
      {recents.length > 0 && (
        <>
          <li role="presentation" className={cn(heading, "flex items-center")}>
            Recent searches
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClearRecent} className="ml-auto normal-case tracking-normal hover:text-foreground">
              Clear
            </button>
          </li>
          {recents.map(row)}
        </>
      )}
      {places.length > 0 && (
        <>
          <li role="presentation" className={heading}>
            Places{hitCount !== null && hitCount > places.length ? ` · top ${places.length} of ${hitCount}` : ""}
          </li>
          {places.map(row)}
        </>
      )}
      {suggestions.length > 0 && (
        <>
          <li role="presentation" className={heading}>Filter instead</li>
          {suggestions.map(row)}
        </>
      )}
      {query.trim().length >= 2 && !places.length && !suggestions.length && (
        <li role="presentation" className="px-3 py-6 text-center text-sm text-muted-foreground">
          Nothing matches “{query.trim()}”. Check the spelling, or try a city or a tag.
        </li>
      )}
    </ul>
  )
}

export interface CommandBarProps {
  value: string
  onChange: (v: string) => void
  hits: SearchHit[] | null
  byId: Map<string, LibraryItem>
  facets: FacetOptions
  /** Opens the quick look; `ids` lets it page through the search results. */
  onOpenPlace: (id: string, ids: string[]) => void
  onApplySuggestion: (facet: SuggestionFacet, value: string) => void
  /** Places the page shows right now, for the phone sheet's "Show N places". */
  shownCount: number
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  /** Filters other than the search are narrowing the results. */
  narrowed: boolean
  onSearchEverywhere: () => void
}

function useCombobox(props: CommandBarProps, onDone: () => void) {
  const { value, hits, byId, facets, onOpenPlace, onApplySuggestion } = props
  const { recent, remember, forget } = useRecentSearches()
  const options = useOptions(value, hits, byId, facets, recent)
  const [active, setActive] = React.useState(-1)
  React.useEffect(() => setActive(-1), [value])

  const pick = (o: Option) => {
    if (o.type === "recent") {
      props.onChange(o.query)
      return
    }
    remember(value)
    if (o.type === "place") {
      onDone()
      onOpenPlace(o.item.id, (hits ?? []).map((h) => h.id))
    } else {
      onDone()
      onApplySuggestion(o.facet, o.value)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && options.length) {
      e.preventDefault()
      setActive((i) => (i + 1) % options.length)
    } else if (e.key === "ArrowUp" && options.length) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (active >= 0 && options[active]) pick(options[active])
      else {
        // Nothing highlighted: keep the search and close the list, so the page shows every match.
        remember(value)
        onDone()
      }
    }
  }

  return { options, active, setActive, pick, onKeyDown, remember, forget }
}

/**
 * "Search your atlas…": the Library's command bar. Typing filters the page
 * live; the list under it jumps straight to a place (Enter opens its quick
 * look) or turns the words into a real filter. On a phone the pill opens a
 * full-screen search sheet instead.
 */
export const LibraryCommandBar = React.forwardRef<HTMLInputElement, CommandBarProps>(function LibraryCommandBar(props, ref) {
  const { value, onChange, hits, shownCount, mobileOpen, onMobileOpenChange, narrowed, onSearchEverywhere } = props
  const [open, setOpen] = React.useState(false)
  const listId = React.useId()
  const inputRef = React.useRef<HTMLInputElement>(null)
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)
  const desktop = useCombobox(props, () => setOpen(false))
  const mobile = useCombobox(props, () => onMobileOpenChange(false))
  const mobileInput = React.useRef<HTMLInputElement>(null)
  const showList = open && desktop.options.length + (value.trim().length >= 2 ? 1 : 0) > 0
  const activeId = desktop.active >= 0 && desktop.options[desktop.active] ? `${listId}-${desktop.options[desktop.active].id}` : undefined

  const pill =
    "relative z-10 flex h-[50px] items-center gap-3 rounded-full border bg-card pl-5 pr-2.5 shadow-[0_8px_28px_rgba(0,0,0,.12)] sm:h-[60px] sm:pl-[22px]"
  const font = "font-editorial text-[21px] sm:text-[26px]"

  return (
    <div className="relative">
      {/* Phones: the pill opens the search sheet; clearing is a separate button beside it, not nested. */}
      <div className={cn(pill, "pr-1.5 focus-within:ring-2 focus-within:ring-ring sm:hidden")}>
        <button
          type="button"
          onClick={() => onMobileOpenChange(true)}
          className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left outline-none"
          aria-label={value ? `Search your library: ${value}` : "Search your library"}
        >
          <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn(font, "min-w-0 flex-1 truncate", value ? "text-foreground" : "text-muted-foreground")}>{value || "Search your atlas…"}</span>
        </button>
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* From sm up: the input itself, with the result list under it. */}
      <div className={cn(pill, "hidden focus-within:ring-2 focus-within:ring-ring sm:flex", showList && "rounded-b-none rounded-t-[30px]")}>
        <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            desktop.remember(value)
            setOpen(false)
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              if (open && (desktop.options.length || value)) setOpen(false)
              else if (value) onChange("")
              else inputRef.current?.blur()
              return
            }
            if (!open) setOpen(true)
            desktop.onKeyDown(e)
          }}
          placeholder="Search your atlas…"
          name="library-search"
          role="combobox"
          aria-label="Search your library"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? activeId : undefined}
          autoComplete="off"
          className={cn(font, "min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden")}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange("")
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span className="mr-1 flex items-center gap-1" aria-hidden>
            <kbd className="rounded-md border px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">⌘K</kbd>
            <kbd className="rounded-md border px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">/</kbd>
          </span>
        )}
      </div>
      {showList && (
        <div className="absolute inset-x-0 top-full z-30 hidden max-h-[min(70vh,560px)] overflow-y-auto rounded-b-[30px] border border-t-0 bg-card pb-2 shadow-[0_18px_40px_rgba(0,0,0,.18)] sm:block">
          <OptionList
            id={listId}
            options={desktop.options}
            active={desktop.active}
            onPick={desktop.pick}
            onForget={desktop.forget}
            onClearRecent={() => desktop.forget(null)}
            query={value}
            hitCount={hits ? hits.length : null}
          />
          {value.trim().length >= 2 && (
            <p className="px-5 pt-1 text-[11px] text-muted-foreground">
              ↑↓ to move · ↵ to open · Esc to close — the page below already shows {hits?.length ?? 0} {hits?.length === 1 ? "match" : "matches"}
              {narrowed && (
                <>
                  {" "}·{" "}
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onSearchEverywhere} className="underline underline-offset-2 hover:text-foreground">
                    search all places
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      )}

      <LibrarySheet
        open={mobileOpen}
        onOpenChange={onMobileOpenChange}
        title="Search your library"
        hideHeader
        full
        initialFocus={mobileInput}
        footer={
          value.trim() ? (
            <button
              type="button"
              onClick={() => {
                mobile.remember(value)
                onMobileOpenChange(false)
              }}
              className="h-11 w-full rounded-full bg-foreground text-sm font-semibold text-background"
            >
              Show {shownCount} {shownCount === 1 ? "place" : "places"}
            </button>
          ) : undefined
        }
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-2.5">
          <button
            type="button"
            onClick={() => onMobileOpenChange(false)}
            aria-label="Back to the library"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <input
            ref={mobileInput}
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={mobile.onKeyDown}
            placeholder="Place, city, tag, note…"
            aria-label="Search your library"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={mobile.options.length > 0}
            aria-controls={`${listId}-m`}
            enterKeyHint="search"
            autoComplete="off"
            className="h-10 min-w-0 flex-1 bg-transparent font-editorial text-[24px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {value && (
            <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <OptionList
          id={`${listId}-m`}
          options={mobile.options}
          active={mobile.active}
          onPick={mobile.pick}
          onForget={mobile.forget}
          onClearRecent={() => mobile.forget(null)}
          query={value}
          hitCount={hits ? hits.length : null}
        />
        {!value.trim() && !mobile.options.length && (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Search names, cities, countries, tags, vibes and your own notes. Typos and accents are fine.
          </p>
        )}
      </LibrarySheet>
    </div>
  )
})
