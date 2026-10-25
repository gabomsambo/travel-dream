"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Inbox, Loader2, Plus, SearchX, Trash2, Upload } from "lucide-react"
import { notify } from "@/lib/notify"
import { ExploreProvider, useExplore } from "@/components/explore/explore-provider"
import { kindLabel } from "@/components/explore/kind-icon"
import { FindImageDialog } from "@/components/places/find-image-dialog"
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/adapters/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useLibraryHearts } from "@/hooks/use-library-hearts"
import { useLibrarySelection } from "@/hooks/use-library-selection"
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/types/user-preferences"
import { cityGroupLabel } from "@/lib/city-names"
import { flagFor } from "@/lib/explore/geo"
import { buildChapters, GROUP_MODES } from "@/lib/library/chapters"
import {
  DEFAULT_SORT, EMPTY_FILTERS, MONTH_NAMES, RECENT_DAYS, buildExportScope, describeFilters, facetCounts, filterItems, suggestionCounts,
  hasActiveFilters, isPlanningSoon, isRecentlyAdded, parseFilters, parseGroup, parseView, shelfOf, smartOf, sortItems,
  toSearchParams, withShelf, withSmart, type Facet, type FilterContext, type LibraryFilterState, type Shelf, type SmartShelf,
} from "@/lib/library/filters"
import { buildSearchIndex, searchLibrary } from "@/lib/library/search"
import type { GroupMode, LibraryData, LibraryItem, LibraryView, SavedViewRow } from "@/lib/library/types"
import type { ExportFormat } from "@/types/export"
import { LibraryActionsContext, type LibraryActions } from "./library-actions"
import { AddToCollectionDialog } from "./library-add-to-collection"
import { LibraryBulkBar, STATUS_OPTIONS, type VisitStatus } from "./library-bulk-bar"
import { LibraryCommandBar, type FacetOptions, type SuggestionFacet } from "./library-command-bar"
import { LibraryCover, SparseCover, coverStats } from "./library-cover"
import { FilterChips, LibraryFilterPills, LibraryFiltersSheetButton, type Chip, type FilterOptions } from "./library-filter-bar"
import { LibraryShelves, TripsShelf } from "./library-shelves"
import { LibraryShortcuts } from "./library-shortcuts"
import { LibrarySmartShelves } from "./library-smart-shelves"
import { LibraryViewBar } from "./library-view-bar"
import { LibraryChapters } from "./library-chapters"
import { LibraryMapView } from "./library-map-view"
import { LibraryTile } from "./library-tile"
import { placesViewport } from "./virtual-rows"

const AddPlaceDialog = dynamic(() => import("@/components/places/add-place-dialog").then((m) => ({ default: m.AddPlaceDialog })), { ssr: false })

/** Below this many places there is nothing to organise yet: one honest grid, no chapters. */
export const SPARSE_THRESHOLD = 12

/** The bulk-actions route takes at most this many ids per request. */
const BULK_BATCH = 500

export function LibraryClient({ data }: { data: LibraryData }) {
  return (
    <ExploreProvider places={data.items} collections={data.collections}>
      <LibraryPage data={data} />
    </ExploreProvider>
  )
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable
}

function overlayOpen(): boolean {
  return Boolean(
    document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"], [data-radix-popper-content-wrapper]')
  )
}

const narrow = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches

async function download(res: Response, format: ExportFormat) {
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `library_export.${format}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

/** Runs one bulk action over any number of ids, in the route's batches. Returns how many rows changed. */
async function runBulk(action: "archive" | "restore" | "delete" | "set-visit-status", ids: string[], extra?: { visitStatus: VisitStatus }): Promise<number> {
  let updated = 0
  for (let i = 0; i < ids.length; i += BULK_BATCH) {
    const res = await fetch("/api/places/bulk-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, placeIds: ids.slice(i, i + BULK_BATCH), ...extra }),
    })
    const body = (await res.json().catch(() => null)) as { message?: string; result?: { updatedCount?: number } } | null
    if (!res.ok) throw new Error(body?.message || `Failed to ${action} places`)
    updated += body?.result?.updatedCount ?? 0
  }
  return updated
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const STATUS_LABEL: Record<string, string> = { not_visited: "Dreaming", planned: "Planned", visited: "Been" }

function LibraryPage({ data }: { data: LibraryData }) {
  const { items, collections, inboxCount } = data
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { openPlace } = useExplore()
  const [preferences] = useLocalStorage<UserPreferences>("user-preferences", DEFAULT_PREFERENCES)
  const fallbackView: LibraryView = preferences.defaultView === "list" ? "list" : "grid"

  // ---- URL state: every filter, the view, sort and grouping -----------------
  const [filters, setFilters] = React.useState<LibraryFilterState>(() => parseFilters(new URLSearchParams(searchParams.toString())))
  const [view, setViewState] = React.useState<LibraryView>(() => parseView(searchParams.get("view"), fallbackView))
  const [sort, setSortState] = React.useState(searchParams.get("sort") || DEFAULT_SORT)
  const [group, setGroupState] = React.useState<GroupMode>(() => parseGroup(searchParams.get("group")))
  // Discrete changes (a chip, a shelf, a view) push a history entry so Back
  // steps back through them; typing replaces the current one.
  const pushNext = React.useRef(false)

  const update = React.useCallback((patch: Partial<LibraryFilterState>, push = true) => {
    if (push) pushNext.current = true
    setFilters((f) => ({ ...f, ...patch }))
  }, [])
  const replaceFilters = React.useCallback((next: LibraryFilterState) => {
    pushNext.current = true
    setFilters(next)
  }, [])
  const setView = React.useCallback((v: LibraryView) => {
    pushNext.current = true
    setViewState(v)
  }, [])
  const setSort = React.useCallback((s: string) => {
    pushNext.current = true
    setSortState(s)
  }, [])
  const setGroup = React.useCallback((g: GroupMode) => {
    pushNext.current = true
    setGroupState(g)
  }, [])

  const query = React.useMemo(() => toSearchParams(filters, { view, sort, group }).toString(), [filters, view, sort, group])

  React.useEffect(() => {
    const write = () => {
      const url = query ? `${pathname}?${query}` : pathname
      const push = pushNext.current
      pushNext.current = false
      if (url === window.location.pathname + window.location.search) return
      // Native history, not router.push: a server round-trip would only re-send the same rows.
      if (push) window.history.pushState(null, "", url)
      else window.history.replaceState(null, "", url)
    }
    if (pushNext.current) {
      write()
      return
    }
    const t = window.setTimeout(write, 300)
    return () => window.clearTimeout(t)
  }, [query, pathname])

  React.useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search)
      setFilters(parseFilters(p))
      setViewState(parseView(p.get("view"), fallbackView))
      setSortState(p.get("sort") || DEFAULT_SORT)
      setGroupState(parseGroup(p.get("group")))
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [fallbackView])

  // ---- hearts, search, filtering --------------------------------------------
  const { hearts, setHearts } = useLibraryHearts({ heartIds: data.heartIds })
  const now = React.useMemo(() => new Date(), [])
  const index = React.useMemo(() => buildSearchIndex(items), [items])
  // Typing stays instant; the page catches up a frame behind on a slow device.
  const deferredSearch = React.useDeferredValue(filters.search)
  const hits = React.useMemo(() => (deferredSearch.trim() ? searchLibrary(index, deferredSearch) : null), [index, deferredSearch])
  const searchIds = React.useMemo(() => (hits ? new Set(hits.map((h) => h.id)) : null), [hits])
  const collected = React.useMemo(() => new Set(collections.flatMap((c) => c.placeIds)), [collections])
  const ctx = React.useMemo<FilterContext>(() => ({ searchIds, hearts, collected, now }), [searchIds, hearts, collected, now])

  // The list follows a deferred copy of the filters. Keyed on `filters` itself, every keystroke
  // re-filtered, re-sorted and re-chaptered the page inside the urgent update.
  const listFilters = React.useDeferredValue(filters)
  const filtered = React.useMemo(() => filterItems(items, listFilters, ctx), [items, listFilters, ctx])
  const sorted = React.useMemo(() => sortItems(filtered, sort), [filtered, sort])
  const sparse = items.length < SPARSE_THRESHOLD
  const chapters = React.useMemo(() => buildChapters(sorted, sparse ? "none" : group, collections, now), [sorted, sparse, group, collections, now])
  // Quick-look ←/→, shift-click ranges and "select all" follow the page as it reads, chapter by chapter.
  const siblings = React.useMemo(() => [...new Set(chapters.flatMap((c) => c.items.map((p) => p.id)))], [chapters])
  const stats = React.useMemo(() => coverStats(items), [items])
  const byId = React.useMemo(() => new Map(items.map((p) => [p.id, p])), [items])
  const knownIds = React.useMemo(() => items.map((p) => p.id), [items])
  const collectionNames = React.useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of collections) for (const id of c.placeIds) m.set(id, [...(m.get(id) ?? []), c.name])
    return m
  }, [collections])
  const filtering = hasActiveFilters(filters)
  const shelf = shelfOf(filters)
  const smart = smartOf(filters)

  const filterOptions = React.useMemo<FilterOptions>(() => {
    const cities = new Map<string, string | null>()
    // One option per city under exonyms (Lisboa and Lisbon are one "Lisbon"), matching the filter and the chapters.
    for (const p of items) if (p.city?.trim() && !cities.has(cityGroupLabel(p.city))) cities.set(cityGroupLabel(p.city), p.country?.trim() || null)
    return {
      countries: [...new Set(items.map((p) => p.country?.trim()).filter((c): c is string => !!c))].sort(),
      cities: [...cities].map(([city, country]) => ({ city, country })).sort((a, b) => a.city.localeCompare(b.city)),
      kinds: [...new Set(items.map((p) => p.kind))].sort(),
      tags: [...new Set(items.flatMap((p) => p.tags))].sort(),
      vibes: [...new Set(items.flatMap((p) => p.vibes))].sort(),
    }
  }, [items])
  const countsFor = React.useCallback((facet: Facet) => facetCounts(items, filters, ctx, facet), [items, filters, ctx])

  const suggestionScope = React.useMemo(
    () => ({ ...filters, search: "" }),
    [
      filters.kinds,
      filters.countries,
      filters.cities,
      filters.tags,
      filters.vibes,
      filters.months,
      filters.rating,
      filters.visitStatus,
      filters.photo,
      filters.hearts,
      filters.soonWeeks,
      filters.addedDays,
      filters.uncollected,
    ],
  )
  const facetOptions = React.useMemo<FacetOptions>(
    () => suggestionCounts(items, suggestionScope, ctx),
    [items, suggestionScope, ctx.hearts, ctx.collected, ctx.now],
  )

  const smartCounts = React.useMemo<Record<SmartShelf, number>>(() => {
    const weeks = filters.soonWeeks || 8
    return {
      soon: items.filter((p) => isPlanningSoon(p, weeks, now)).length,
      recent: items.filter((p) => isRecentlyAdded(p, RECENT_DAYS, now)).length,
      uncollected: items.filter((p) => !collected.has(p.id)).length,
      nophoto: items.filter((p) => p.photos.length === 0).length,
    }
  }, [items, collected, now, filters.soonWeeks])
  const heartCount = React.useMemo(() => items.filter((p) => hearts.has(p.id)).length, [items, hearts])

  const setShelf = React.useCallback((s: Shelf) => replaceFilters(withShelf(filters, s)), [filters, replaceFilters])
  const clearFilters = React.useCallback(() => replaceFilters(EMPTY_FILTERS), [replaceFilters])

  // ---- saved views ------------------------------------------------------------
  const [views, setViews] = React.useState<SavedViewRow[]>(data.savedViews)
  React.useEffect(() => setViews(data.savedViews), [data.savedViews])
  const activeView = views.find((v) => v.query === query) ?? null
  const canSave = query !== "" && !activeView
  const suggestedName = React.useMemo(() => {
    const words = describeFilters(filters, kindLabel).slice(0, 3)
    const groupLabel = GROUP_MODES.find((g) => g.value === group)?.label
    const name = words.join(" · ") || (group !== "country" && groupLabel ? `By ${groupLabel.toLowerCase()}` : "My view")
    return name.slice(0, 60)
  }, [filters, group])

  const applyView = React.useCallback(
    (v: SavedViewRow) => {
      const p = new URLSearchParams(v.query)
      pushNext.current = true
      setFilters(parseFilters(p))
      setViewState(parseView(p.get("view"), "grid"))
      setSortState(p.get("sort") || DEFAULT_SORT)
      setGroupState(parseGroup(p.get("group")))
    },
    []
  )

  const viewRequest = async (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<SavedViewRow | null> => {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
    const json = (await res.json().catch(() => null)) as { message?: string; view?: SavedViewRow } | null
    if (!res.ok) throw new Error(json?.message || "That didn't save. Try again in a moment.")
    return json?.view ?? null
  }

  const saveView = async (name: string, q = query): Promise<boolean> => {
    try {
      const view = await viewRequest("/api/library/views", "POST", { name, query: q })
      if (view) setViews((list) => [...list, view])
      notify.success(`Saved “${name}”`, { description: "It's on your shelves now, on every device." })
      return true
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Couldn't save that view.")
      return false
    }
  }
  const renameView = async (v: SavedViewRow, name: string): Promise<boolean> => {
    try {
      const view = await viewRequest(`/api/library/views/${encodeURIComponent(v.id)}`, "PATCH", { name })
      if (view) setViews((list) => list.map((x) => (x.id === v.id ? view : x)))
      return true
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Couldn't rename that view.")
      return false
    }
  }
  const updateView = async (v: SavedViewRow) => {
    try {
      const view = await viewRequest(`/api/library/views/${encodeURIComponent(v.id)}`, "PATCH", { query })
      if (view) setViews((list) => list.map((x) => (x.id === v.id ? view : x)))
      notify.success(`“${v.name}” now shows these filters`)
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Couldn't update that view.")
    }
  }
  const deleteView = async (v: SavedViewRow) => {
    try {
      await viewRequest(`/api/library/views/${encodeURIComponent(v.id)}`, "DELETE")
      setViews((list) => list.filter((x) => x.id !== v.id))
      notify.success(`Deleted “${v.name}”`, { cancel: { label: "Undo", onClick: () => void saveView(v.name, v.query) } })
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Couldn't delete that view.")
    }
  }

  // ---- selection and what it can do -------------------------------------------
  const sel = useLibrarySelection(knownIds, siblings)
  const [pendingDelete, setPendingDelete] = React.useState<string[] | null>(null)
  const [confirmText, setConfirmText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [isExporting, setIsExporting] = React.useState(false)
  const [findImageFor, setFindImageFor] = React.useState<LibraryItem | null>(null)
  const [addPlaceOpen, setAddPlaceOpen] = React.useState(false)
  const [addToIds, setAddToIds] = React.useState<string[] | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)
  const [searchSheetOpen, setSearchSheetOpen] = React.useState(false)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const selectedIds = React.useMemo(() => [...sel.selected], [sel.selected])

  const restore = React.useCallback(
    async (ids: string[]) => {
      try {
        const n = await runBulk("restore", ids)
        notify.success(`Restored ${plural(n, "place")}`)
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "Couldn't restore those places.")
      }
      router.refresh()
    },
    [router]
  )

  const archive = React.useCallback(
    async (ids: string[]) => {
      if (!ids.length) return
      setBusy(true)
      try {
        const n = await runBulk("archive", ids)
        sel.remove(ids)
        notify.success(`Archived ${plural(n, "place")}`, {
          description: "They're in your Archive.",
          duration: 8_000,
          cancel: { label: "Undo", onClick: () => void restore(ids) },
        })
        router.refresh()
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "Couldn't archive those places.")
      } finally {
        setBusy(false)
      }
    },
    [router, restore, sel]
  )

  const setStatus = React.useCallback(
    async (ids: string[], status: VisitStatus) => {
      if (!ids.length) return
      const before = new Map<VisitStatus, string[]>()
      for (const id of ids) {
        const was = byId.get(id)?.visitStatus
        if (was && was !== status) before.set(was, [...(before.get(was) ?? []), id])
      }
      const label = STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status
      if (!before.size) {
        notify.info(`${ids.length === 1 ? "It's" : "They're"} already ${label}`)
        return
      }
      setBusy(true)
      try {
        const changed = [...before.values()].flat()
        await runBulk("set-visit-status", changed, { visitStatus: status })
        notify.success(`Marked ${plural(changed.length, "place")} as ${label}`, {
          duration: 8_000,
          cancel: {
            label: "Undo",
            onClick: () =>
              void (async () => {
                try {
                  for (const [was, list] of before) await runBulk("set-visit-status", list, { visitStatus: was })
                  notify.success("Put back as they were")
                } catch {
                  notify.error("Couldn't undo that. Set the status again by hand.")
                }
                router.refresh()
              })(),
          },
        })
        router.refresh()
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "Couldn't change the status.")
      } finally {
        setBusy(false)
      }
    },
    [byId, router]
  )

  const heartMany = React.useCallback(
    async (ids: string[], on: boolean) => {
      const changed = ids.filter((id) => hearts.has(id) !== on)
      if (!changed.length) return
      if (await setHearts(changed, on)) {
        notify.success(on ? `Hearted ${plural(changed.length, "place")}` : `Removed ${plural(changed.length, "heart")}`, {
          cancel: { label: "Undo", onClick: () => void setHearts(changed, !on) },
        })
      }
    },
    [hearts, setHearts]
  )

  const reallyDelete = React.useCallback(
    async (ids: string[]) => {
      setBusy(true)
      try {
        const n = await runBulk("delete", ids)
        notify.success(`Deleted ${plural(n, "place")}`)
        setPendingDelete(null)
        setConfirmText("")
        sel.remove(ids)
        router.refresh()
      } catch (e) {
        notify.errorPersistent(e instanceof Error ? e.message : "Couldn't delete those places.")
      } finally {
        setBusy(false)
      }
    },
    [router, sel]
  )

  const handleExport = React.useCallback(
    async (format: ExportFormat) => {
      const ids = sel.selected.size ? [...sel.selected] : sorted.map((p) => p.id)
      if (!ids.length) return
      const { scope, approximate } = sel.selected.size
        ? { scope: { type: "selected" as const, placeIds: ids.slice(0, 500) }, approximate: ids.length > 500 }
        : buildExportScope(filters, ids)
      setIsExporting(true)
      try {
        const res = await fetch("/api/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, format, preset: "standard" }),
        })
        if (!res.ok) throw new Error("Export failed")
        await download(res, format)
        if (approximate) {
          notify.warning(`Exported as ${format.toUpperCase()}`, {
            description: sel.selected.size
              ? "Exports hold up to 500 places at a time, so the first 500 selected are in this file."
              : "More than 500 places matched, so some filters (visit status, photos, hearts, smart shelves, several values, fuzzy search) were applied loosely.",
          })
        } else {
          notify.success(`Exported ${plural(ids.length, "place")} as ${format.toUpperCase()}`)
        }
      } catch (error) {
        console.error("Export error:", error)
        notify.error("Export failed. Please try again.")
      } finally {
        setIsExporting(false)
      }
    },
    [sel.selected, sorted, filters]
  )

  const actions = React.useMemo<LibraryActions>(
    () => ({
      hearts,
      toggleHeart: (id) => void setHearts([id], !hearts.has(id)),
      selected: sel.selected,
      selecting: sel.selecting,
      toggleSelect: (id, opts) => sel.toggle(id, { range: opts?.shiftKey }),
      select: (id) => sel.toggle(id),
      activate: (id, ids, opts) => {
        if (sel.selecting || opts?.shiftKey) sel.toggle(id, { range: opts?.shiftKey && sel.selecting })
        else openPlace(id, ids)
      },
      openPlace,
      archive: (ids) => void archive(ids),
      remove: (ids) => {
        if (!ids.length) return
        setConfirmText("")
        setPendingDelete(ids)
      },
      addToCollection: (ids) => ids.length && setAddToIds(ids),
      findImage: setFindImageFor,
    }),
    [hearts, setHearts, sel, openPlace, archive]
  )

  const focusSearch = React.useCallback(() => {
    if (narrow()) {
      setSearchSheetOpen(true)
      return
    }
    const el = searchRef.current
    if (!el) return
    el.scrollIntoView?.({ block: "center", behavior: "smooth" })
    el.focus({ preventScroll: true })
    el.select()
  }, [])

  // Keyboard: the shortcuts the "?" sheet lists, and only those.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === "k" && !e.shiftKey && !e.altKey) {
        // A second ⌘K from the Library's own search falls through to the app's command palette.
        if (!searchRef.current || document.activeElement === searchRef.current || overlayOpen()) return
        e.preventDefault()
        e.stopImmediatePropagation()
        focusSearch()
        return
      }
      if (isTyping(e.target) || overlayOpen()) return
      const focused = (document.activeElement as HTMLElement | null)?.dataset?.placeId
      if (e.key === "/" && !mod) {
        if (!searchRef.current) return
        e.preventDefault()
        focusSearch()
      } else if (e.key === "?" && !mod) {
        e.preventDefault()
        setShortcutsOpen(true)
      } else if (mod && !e.shiftKey && !e.altKey && key === "a") {
        e.preventDefault()
        sel.selectAll()
      } else if (e.key === "Escape" && sel.selecting) {
        sel.clear()
      } else if (mod || e.altKey) {
        return
      } else if (key === "s" && !e.shiftKey) {
        e.preventDefault()
        if (sel.selecting) sel.clear()
        else sel.setMode(true)
      } else if (key === "f" && !e.shiftKey) {
        const trigger = [...document.querySelectorAll<HTMLElement>("[data-library-filters]")].find((el) => el.offsetParent !== null)
        if (trigger) {
          e.preventDefault()
          trigger.click()
        }
      } else if (key === "j" || key === "k") {
        const places = [...document.querySelectorAll<HTMLElement>("[data-place-id]")].filter((el) => el.offsetParent !== null)
        if (!places.length) return
        e.preventDefault()
        const i = places.indexOf(document.activeElement as HTMLElement)
        // Overscan keeps rows above and below the screen mounted; starting from either would yank scroll back.
        const viewRect = placesViewport()?.getBoundingClientRect()
        const top = viewRect?.top ?? 0
        const bottom = viewRect?.bottom ?? Number.POSITIVE_INFINITY
        const onScreen = Math.max(places.findIndex((el) => el.getBoundingClientRect().bottom > top), 0)
        const focusRect = i >= 0 ? places[i].getBoundingClientRect() : null
        const focusOffScreen = focusRect !== null && (focusRect.bottom <= top || focusRect.top >= bottom)
        const next =
          i < 0 || focusOffScreen
            ? onScreen
            : Math.min(Math.max(i + (key === "j" ? 1 : -1), 0), places.length - 1)
        places[next].focus()
        places[next].scrollIntoView({ block: "nearest", behavior: "smooth" })
      } else if ((e.key === " " || key === "x") && focused) {
        e.preventDefault()
        sel.toggle(focused, { range: e.shiftKey })
      } else if (sel.selected.size > 0 && ["c", "h", "e", "a", "d"].includes(key) && !e.shiftKey) {
        e.preventDefault()
        if (key === "c") setAddToIds([...sel.selected])
        else if (key === "h") void heartMany([...sel.selected], ![...sel.selected].every((id) => hearts.has(id)))
        else if (key === "e") void handleExport("csv")
        else if (key === "a") void archive([...sel.selected])
        else actions.remove([...sel.selected])
      }
    }
    // Capture, so ⌘K reaches the Library before the app's global palette does.
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [sel, focusSearch, heartMany, hearts, handleExport, archive, actions])

  // ---- chips --------------------------------------------------------------
  const chips = React.useMemo<Chip[]>(() => {
    const out: Chip[] = []
    const drop = <K extends keyof LibraryFilterState>(key: K, v: unknown) => () => {
      const cur = filters[key]
      if (cur instanceof Set) {
        const next = new Set(cur as Set<unknown>)
        next.delete(v)
        update({ [key]: next } as Partial<LibraryFilterState>)
      }
    }
    if (filters.search.trim()) out.push({ key: "search", label: `“${filters.search.trim()}”`, onRemove: () => update({ search: "" }) })
    if (shelf !== "all" && shelf !== null) out.push({ key: "shelf", label: shelf === "hearts" ? "♥ Hearts" : STATUS_LABEL[shelf], onRemove: () => setShelf("all") })
    if (shelf === null) {
      if (filters.hearts) out.push({ key: "hearts", label: "♥ Hearts", onRemove: () => update({ hearts: false }) })
      for (const s of filters.visitStatus) out.push({ key: `vs:${s}`, label: STATUS_LABEL[s] ?? s, onRemove: drop("visitStatus", s) })
    }
    if (filters.soonWeeks) out.push({ key: "soon", label: `Planned in the next ${filters.soonWeeks} weeks`, onRemove: () => update({ soonWeeks: 0 }) })
    if (filters.addedDays) out.push({ key: "added", label: `Added in the last ${filters.addedDays} days`, onRemove: () => update({ addedDays: 0 }) })
    if (filters.uncollected) out.push({ key: "uncollected", label: "Not in a collection", onRemove: () => update({ uncollected: false }) })
    for (const c of filters.countries) out.push({ key: `country:${c}`, label: `${flagFor(c) ? `${flagFor(c)} ` : ""}${c}`, onRemove: drop("countries", c) })
    for (const c of filters.cities) out.push({ key: `city:${c}`, label: c, onRemove: drop("cities", c) })
    for (const k of filters.kinds) out.push({ key: `kind:${k}`, label: kindLabel(k), onRemove: drop("kinds", k) })
    for (const t of filters.tags) out.push({ key: `tag:${t}`, label: `#${t}`, onRemove: drop("tags", t) })
    for (const v of filters.vibes) out.push({ key: `vibe:${v}`, label: v.replace(/-/g, " "), onRemove: drop("vibes", v) })
    for (const m of [...filters.months].sort((a, b) => a - b)) out.push({ key: `month:${m}`, label: `Best in ${MONTH_NAMES[m - 1]}`, onRemove: drop("months", m) })
    if (filters.photo !== "any") out.push({ key: "photo", label: filters.photo === "with" ? "With a photo" : "Missing a photo", onRemove: () => update({ photo: "any" }) })
    if (filters.rating > 0) out.push({ key: "rating", label: `${filters.rating}★ and up`, onRemove: () => update({ rating: 0 }) })
    return out
  }, [filters, shelf, update, setShelf])

  const applySuggestion = React.useCallback(
    (facet: SuggestionFacet, value: string) => {
      const cur = filters[facet]
      replaceFilters({ ...filters, search: "", [facet]: new Set([...cur, value]) })
    },
    [filters, replaceFilters]
  )

  const empty = items.length === 0
  const showTrips = !sparse && !filtering && view !== "map" && collections.length > 0
  // Built once per change, so the memoized chapters below don't re-render on every keystroke.
  const tripsInterlude = React.useMemo(
    () => (showTrips ? <TripsShelf collections={collections} byId={byId} now={now} /> : null),
    [showTrips, collections, byId, now]
  )
  const allShownSelected = siblings.length > 0 && siblings.every((id) => sel.selected.has(id))
  // One pill per facet once the row can hold them all beside the tools (about 1400 px);
  // narrower screens get the same controls in one "Filters" sheet.
  const filterControls = (
    <>
      <div className="hidden min-[1400px]:block">
        <LibraryFilterPills filters={filters} update={update} options={filterOptions} countsFor={countsFor} />
      </div>
      <div className="min-[1400px]:hidden">
        <LibraryFiltersSheetButton
          filters={filters}
          update={update}
          options={filterOptions}
          countsFor={countsFor}
          shownCount={sorted.length}
          onClearAll={() => replaceFilters({ ...EMPTY_FILTERS, search: filters.search })}
        />
      </div>
    </>
  )

  return (
    <LibraryActionsContext.Provider value={actions}>
      {empty || sparse ? <SparseCover total={items.length} countries={stats.countries} /> : <LibraryCover items={items} stats={stats} onShelf={setShelf} onGroup={setGroup} />}

      {!empty && (
        <div className="relative z-30 -mt-[26px] px-4 sm:-mt-[34px] sm:px-8">
          <LibraryCommandBar
            ref={searchRef}
            value={filters.search}
            onChange={(search) => update({ search }, false)}
            hits={hits}
            byId={byId}
            facets={facetOptions}
            onOpenPlace={(id, ids) => openPlace(id, ids)}
            onApplySuggestion={applySuggestion}
            shownCount={sorted.length}
            mobileOpen={searchSheetOpen}
            onMobileOpenChange={setSearchSheetOpen}
            narrowed={chips.some((c) => c.key !== "search")}
            onSearchEverywhere={() => replaceFilters({ ...EMPTY_FILTERS, search: filters.search })}
          />
        </div>
      )}

      {!empty && !sparse && (
        <div className="space-y-3 px-4 pt-4 sm:px-8 sm:pt-[22px]">
          <LibraryShelves
            active={shelf}
            onShelf={setShelf}
            counts={{ all: stats.total, not_visited: stats.dreaming, planned: stats.planned, visited: stats.been, hearts: heartCount }}
          />
          <LibrarySmartShelves
            inboxCount={inboxCount}
            counts={smartCounts}
            active={smart}
            soonWeeks={filters.soonWeeks || 8}
            onSmart={(s) => replaceFilters(withSmart(filters, s))}
            onSoonWeeks={(w) => update({ soonWeeks: w })}
            views={views}
            activeViewId={activeView?.id ?? null}
            onApplyView={applyView}
            onRenameView={renameView}
            onUpdateView={(v) => void updateView(v)}
            onDeleteView={(v) => void deleteView(v)}
            canSave={canSave}
            suggestedName={suggestedName}
            onSaveView={(name) => saveView(name)}
          />
        </div>
      )}

      {/* Phones get the trips shelf after the first chapter instead (see LibraryChapters' interlude). */}
      {showTrips && (
        <div className="hidden px-8 pt-7 sm:block">
          <TripsShelf collections={collections} byId={byId} now={now} />
        </div>
      )}

      {empty ? (
        <EmptyLibrary inboxCount={inboxCount} onAddPlace={() => setAddPlaceOpen(true)} />
      ) : (
        <div className="mt-5 sm:mt-6">
          <p className="sr-only" aria-live="polite">
            {sorted.length === items.length ? `${plural(items.length, "place")}` : `Showing ${sorted.length} of ${plural(items.length, "place")}`}
          </p>
          <LibraryViewBar
            showGroup={!sparse}
            group={group}
            onGroup={setGroup}
            filtersSlot={filterControls}
            chips={<FilterChips chips={chips} summary={`${sorted.length} of ${plural(items.length, "place")}`} onClearAll={clearFilters} />}
            sort={sort}
            onSort={setSort}
            view={view}
            onView={setView}
            exportLabel={sel.selected.size ? `Export (${sel.selected.size})` : "Export"}
            exportDisabled={sel.selected.size === 0 && sorted.length === 0}
            isExporting={isExporting}
            onExport={handleExport}
            selecting={sel.selecting}
            onSelectToggle={() => (sel.selecting ? sel.clear() : sel.setMode(true))}
          />

          {sorted.length === 0 ? (
            <NoMatches
              filters={filters}
              onClear={clearFilters}
              onKeepSearch={chips.some((c) => c.key !== "search") && filters.search.trim() ? () => replaceFilters({ ...EMPTY_FILTERS, search: filters.search }) : undefined}
            />
          ) : view === "map" ? (
            <LibraryMapView chapters={chapters} items={sorted} siblings={siblings} stats={stats} />
          ) : sparse && view === "grid" ? (
            <SparseGrid items={sorted} siblings={siblings} inboxCount={inboxCount} onAddPlace={() => setAddPlaceOpen(true)} />
          ) : (
            <LibraryChapters
              chapters={chapters}
              group={sparse ? "none" : group}
              view={view}
              siblings={siblings}
              collectionNames={collectionNames}
              interlude={tripsInterlude}
            />
          )}
        </div>
      )}

      {sel.selecting && (
        <LibraryBulkBar
          count={sel.selected.size}
          hiddenCount={sel.selected.size - sel.visibleSelected}
          shownCount={siblings.length}
          allShownSelected={allShownSelected}
          busy={busy}
          isExporting={isExporting}
          allHearted={selectedIds.length > 0 && selectedIds.every((id) => hearts.has(id))}
          onSelectAll={sel.selectAll}
          onClear={sel.clear}
          onAddToCollection={() => setAddToIds(selectedIds)}
          onSetStatus={(s) => void setStatus(selectedIds, s)}
          onHeart={(on) => void heartMany(selectedIds, on)}
          onExport={(f) => void handleExport(f)}
          onArchive={() => void archive(selectedIds)}
          onDelete={() => actions.remove(selectedIds)}
          onShortcuts={() => setShortcutsOpen(true)}
        />
      )}
      {/* Keeps the last chapter clear of the floating bar. */}
      {sel.selecting && <div className="h-20" aria-hidden />}

      <AddToCollectionDialog
        placeIds={addToIds}
        onOpenChange={(o) => !o && setAddToIds(null)}
        collections={collections}
        byId={byId}
        onDone={() => undefined}
      />
      <LibraryShortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <FindImageDialog
        placeId={findImageFor?.id ?? ""}
        placeName={findImageFor?.name ?? ""}
        placeCity={findImageFor?.city}
        hasGooglePlaceId={false}
        open={findImageFor !== null}
        onOpenChange={(o) => !o && setFindImageFor(null)}
        onAttached={() => router.refresh()}
      />
      {addPlaceOpen && <AddPlaceDialog open={addPlaceOpen} onOpenChange={setAddPlaceOpen} onPlaceCreated={() => router.refresh()} />}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && !busy && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently Delete {pendingDelete?.length} Place(s)?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block font-semibold text-destructive">This action cannot be undone.</span>
              <span className="block">
                These places will be completely removed from the database, including all associated data. To keep them out of sight instead,
                Archive them — that can be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <Label htmlFor="confirm-text">Type &quot;confirm&quot; to proceed:</Label>
            <Input id="confirm-text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="confirm" autoFocus disabled={busy} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => pendingDelete && void reallyDelete(pendingDelete)}
              disabled={confirmText.toLowerCase() !== "confirm" || busy}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {busy ? "Deleting..." : "Delete Permanently"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </LibraryActionsContext.Provider>
  )
}

function InviteTile({ icon: Icon, title, sub, href, onClick }: { icon: typeof Upload; title: string; sub?: string; href?: string; onClick?: () => void }) {
  const cls =
    "flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 text-center text-[13px] font-medium text-muted-foreground outline-none transition hover:bg-secondary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
  const body = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      {title}
      {sub && <span className="text-xs font-normal">{sub}</span>}
    </>
  )
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

function Invitations({ inboxCount, onAddPlace }: { inboxCount: number; onAddPlace: () => void }) {
  return (
    <>
      <InviteTile icon={Upload} title="Drop screenshots" sub="Upload turns them into places" href="/inbox?sheet=1" />
      <InviteTile icon={Plus} title="Add a place by name" onClick={onAddPlace} />
      {inboxCount > 0 && <InviteTile icon={Inbox} title={`${inboxCount} waiting in your Inbox`} sub="Confirm them into your atlas" href="/inbox" />}
    </>
  )
}

/** Under a dozen places: one grid, with the ways to add more right beside them. */
function SparseGrid({ items, siblings, inboxCount, onAddPlace }: { items: LibraryItem[]; siblings: string[]; inboxCount: number; onAddPlace: () => void }) {
  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 md:grid-cols-3 xl:grid-cols-4">
        {items.map((p) => (
          <LibraryTile key={p.id} item={p} siblings={siblings} />
        ))}
        <Invitations inboxCount={inboxCount} onAddPlace={onAddPlace} />
      </div>
      <p className="mt-5 text-[13px] text-muted-foreground">
        Chapters, the index, smart shelves and your trips shelf appear once there are enough places to organise — about a dozen.
      </p>
    </div>
  )
}

function EmptyLibrary({ inboxCount, onAddPlace }: { inboxCount: number; onAddPlace: () => void }) {
  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 md:grid-cols-3 xl:grid-cols-4">
        <Invitations inboxCount={inboxCount} onAddPlace={onAddPlace} />
      </div>
    </div>
  )
}

function NoMatches({ filters, onClear, onKeepSearch }: { filters: LibraryFilterState; onClear: () => void; onKeepSearch?: () => void }) {
  const parts = describeFilters(filters, kindLabel)
  return (
    <div className="flex flex-col items-center px-4 py-20 text-center">
      <SearchX className="h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 font-editorial text-4xl">Nothing in your atlas matches</h2>
      {parts.length > 0 && <p className="mt-2 max-w-md text-sm text-muted-foreground">Looking for {parts.join(" · ")}.</p>}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onKeepSearch && (
          <Button variant="outline" className="rounded-full" onClick={onKeepSearch}>
            Search all places for “{filters.search.trim()}”
          </Button>
        )}
        <Button variant="outline" className="rounded-full" onClick={onClear}>
          Clear filters
        </Button>
      </div>
      {onKeepSearch && <p className="mt-3 text-xs text-muted-foreground">Clearing filters also empties the search box.</p>}
    </div>
  )
}
