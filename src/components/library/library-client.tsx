"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Archive, Inbox, Loader2, Plus, SearchX, Trash2, Upload } from "lucide-react"
import { notify } from "@/lib/notify"
import { ExploreProvider, useExplore } from "@/components/explore/explore-provider"
import { FindImageDialog } from "@/components/places/find-image-dialog"
import { PlaceFiltersSidebar } from "@/components/library-v2/place-filters-sidebar"
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/adapters/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDebounce } from "@/hooks/use-debounce"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/types/user-preferences"
import { fuzzySearch, initializeSearchIndex } from "@/lib/search-service"
import { readDreams, setDream } from "@/lib/explore/dreams"
import { buildChapters } from "@/lib/library/chapters"
import {
  EMPTY_FILTERS, buildExportScope, filterItems, hasActiveFilters, panelFilterCount, parseFilters, parseGroup, parseView,
  shelfOf, sortItems, toSearchParams, type LibraryFilterState, type Shelf,
} from "@/lib/library/filters"
import type { GroupMode, LibraryData, LibraryItem, LibraryView } from "@/lib/library/types"
import type { ExportFormat } from "@/types/export"
import { ActiveFilterChips } from "./active-filter-chips"
import { LibraryToolbar } from "./library-toolbar"
import { LibraryActionsContext, type LibraryActions } from "./library-actions"
import { LibraryCover, LibrarySearchPill, SparseCover, coverStats } from "./library-cover"
import { LibraryShelves, TripsShelf } from "./library-shelves"
import { LibraryViewBar, viewBarPill } from "./library-view-bar"
import { LibraryChapters } from "./library-chapters"
import { LibraryMapView } from "./library-map-view"
import { LibraryTile } from "./library-tile"

const AddPlaceDialog = dynamic(() => import("@/components/places/add-place-dialog").then((m) => ({ default: m.AddPlaceDialog })), { ssr: false })

/** Below this many places there is nothing to organise yet: one honest grid, no chapters. */
export const SPARSE_THRESHOLD = 12

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

function LibraryPage({ data }: { data: LibraryData }) {
  const { items, collections, inboxCount } = data
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { openPlace } = useExplore()
  const [preferences] = useLocalStorage<UserPreferences>("user-preferences", DEFAULT_PREFERENCES)

  const [filters, setFilters] = React.useState<LibraryFilterState>(() => parseFilters(new URLSearchParams(searchParams.toString())))
  const [view, setView] = React.useState<LibraryView>(() => parseView(searchParams.get("view"), preferences.defaultView === "list" ? "list" : "grid"))
  const [sort, setSort] = React.useState(searchParams.get("sort") || "date-newest")
  const [group, setGroup] = React.useState<GroupMode>(() => parseGroup(searchParams.get("group")))

  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = React.useState(false)
  const selecting = selectMode || selected.size > 0
  const [hearts, setHearts] = React.useState<Set<string>>(new Set())
  const [pending, setPending] = React.useState<{ kind: "archive" | "delete"; ids: string[] } | null>(null)
  const [confirmText, setConfirmText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [isExporting, setIsExporting] = React.useState(false)
  const [findImageFor, setFindImageFor] = React.useState<LibraryItem | null>(null)
  const [addPlaceOpen, setAddPlaceOpen] = React.useState(false)
  const [showKeyboardHints, setShowKeyboardHints] = React.useState(false)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const now = React.useMemo(() => new Date(), [])

  // Hearts live on this device (shared with Shuffle) until they become an account field.
  React.useEffect(() => setHearts(readDreams()), [])

  // Built before the first filter pass, so a /library?search=… link filters on arrival.
  const indexed = React.useRef<LibraryItem[] | null>(null)
  if (indexed.current !== items) {
    initializeSearchIndex(items)
    indexed.current = items
  }

  const debouncedSearch = useDebounce(filters.search, 300)
  React.useEffect(() => {
    const qs = toSearchParams({ ...filters, search: debouncedSearch }, { view, sort, group }).toString()
    // replaceState, not router.replace: a server round-trip would only re-send the same rows.
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
  }, [filters, debouncedSearch, view, sort, group, pathname])

  const searchIds = React.useMemo(
    () => (filters.search.trim() ? new Set(fuzzySearch(filters.search).map((r) => r.place.id)) : null),
    [filters.search]
  )
  const filtered = React.useMemo(() => filterItems(items, filters, searchIds), [items, filters, searchIds])
  const sorted = React.useMemo(() => sortItems(filtered, sort), [filtered, sort])
  const sparse = items.length < SPARSE_THRESHOLD
  const chapters = React.useMemo(
    () => buildChapters(sorted, sparse ? "none" : group, collections, now),
    [sorted, sparse, group, collections, now]
  )
  // Quick-look ←/→ walks the page in the order it reads, chapter by chapter.
  const siblings = React.useMemo(() => [...new Set(chapters.flatMap((c) => c.items.map((p) => p.id)))], [chapters])
  const visibleIds = React.useMemo(() => sorted.map((p) => p.id), [sorted])
  const stats = React.useMemo(() => coverStats(items), [items])
  const byId = React.useMemo(() => new Map(items.map((p) => [p.id, p])), [items])
  const collectionNames = React.useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of collections) for (const id of c.placeIds) m.set(id, [...(m.get(id) ?? []), c.name])
    return m
  }, [collections])
  const filtering = hasActiveFilters(filters)
  const shelf = shelfOf(filters)

  const filterOptions = React.useMemo(
    () => ({
      kinds: [...new Set(items.map((p) => p.kind))].sort(),
      cities: [...new Set(items.map((p) => p.city).filter((c): c is string => !!c))].sort(),
      countries: [...new Set(items.map((p) => p.country).filter((c): c is string => !!c))].sort(),
      tags: [...new Set(items.flatMap((p) => p.tags))].sort(),
      vibes: [...new Set(items.flatMap((p) => p.vibes))].sort(),
    }),
    [items]
  )

  const update = React.useCallback((patch: Partial<LibraryFilterState>) => setFilters((f) => ({ ...f, ...patch })), [])
  const clearFilters = React.useCallback(() => setFilters(EMPTY_FILTERS), [])
  const setShelf = React.useCallback(
    (s: Shelf) => update({ visitStatus: s === "all" ? new Set() : new Set([s]) }),
    [update]
  )

  const selectNone = React.useCallback(() => {
    setSelected(new Set())
    setSelectMode(false)
  }, [])
  const toggleSelect = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const selectAll = React.useCallback(() => setSelected(new Set(visibleIds)), [visibleIds])

  const toggleHeart = React.useCallback(
    (id: string) => {
      const on = !hearts.has(id)
      setDream(id, on)
      setHearts((prev) => {
        const next = new Set(prev)
        if (on) next.add(id)
        else next.delete(id)
        return next
      })
    },
    [hearts]
  )

  const actions = React.useMemo<LibraryActions>(
    () => ({
      hearts,
      toggleHeart,
      selected,
      selecting,
      toggleSelect,
      select: (id) => {
        setSelectMode(true)
        toggleSelect(id)
      },
      activate: (id, ids) => (selecting ? toggleSelect(id) : openPlace(id, ids)),
      openPlace,
      archive: (ids) => {
        if (ids.length) setPending({ kind: "archive", ids })
      },
      remove: (ids) => {
        if (!ids.length) return
        setConfirmText("")
        setPending({ kind: "delete", ids })
      },
      findImage: setFindImageFor,
    }),
    [hearts, toggleHeart, selected, selecting, toggleSelect, openPlace]
  )

  const runBulk = React.useCallback(
    async (action: "archive" | "delete", ids: string[]) => {
      setBusy(true)
      try {
        const res = await fetch("/api/places/bulk-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, placeIds: ids }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || `Failed to ${action} places`)
        }
        const result = await res.json()
        const n = result.result?.updatedCount || ids.length
        notify.success(action === "archive" ? `Archived ${n} place(s)` : `Deleted ${n} place(s)`)
        setPending(null)
        setConfirmText("")
        setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))))
        router.refresh()
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to ${action} places`
        if (action === "delete") notify.errorPersistent(message)
        else notify.error(message)
        if (action === "archive") setPending(null)
      } finally {
        setBusy(false)
      }
    },
    [router]
  )

  const handleExport = React.useCallback(
    async (format: ExportFormat) => {
      const ids = selected.size ? [...selected] : visibleIds
      if (!ids.length) return
      const { scope, approximate } = selected.size
        ? { scope: { type: "selected" as const, placeIds: ids }, approximate: false }
        : buildExportScope(filters, visibleIds)
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
            description: "More than 500 places matched, so some filters (visit status, photos, several kinds, fuzzy search) were applied loosely.",
          })
        } else {
          notify.success(selected.size ? `Exported ${ids.length} place(s)` : `Exported ${ids.length} places as ${format.toUpperCase()}`)
        }
      } catch (error) {
        console.error("Export error:", error)
        notify.error("Export failed. Please try again.")
      } finally {
        setIsExporting(false)
      }
    },
    [selected, visibleIds, filters]
  )

  // Keyboard: the shortcuts the toolbar lists, and only those.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"]')) return
      const mod = e.metaKey || e.ctrlKey
      if (e.key === "/" && !mod) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault()
        setSelectMode(true)
        selectAll()
      } else if (e.key === "Escape" && selecting) {
        selectNone()
      } else if (!mod && (e.key === "j" || e.key === "k")) {
        const places = [...document.querySelectorAll<HTMLElement>("[data-place-id]")].filter((el) => el.offsetParent !== null)
        if (!places.length) return
        e.preventDefault()
        const i = places.indexOf(document.activeElement as HTMLElement)
        const next = i < 0 ? 0 : Math.min(Math.max(i + (e.key === "j" ? 1 : -1), 0), places.length - 1)
        places[next].focus()
        places[next].scrollIntoView({ block: "nearest", behavior: "smooth" })
      } else if (e.key === " " && !mod && (document.activeElement as HTMLElement | null)?.dataset.placeId) {
        e.preventDefault()
        setSelectMode(true)
        toggleSelect((document.activeElement as HTMLElement).dataset.placeId!)
      } else if (!mod && selected.size && (e.key === "a" || e.key === "d")) {
        e.preventDefault()
        if (e.key === "a") actions.archive([...selected])
        else actions.remove([...selected])
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selecting, selected, selectAll, selectNone, toggleSelect, actions])

  const chips = (
    <ActiveFilterChips
      className="flex-nowrap gap-1.5 lg:ml-1"
      filters={{
        kind: filters.kinds.size ? [...filters.kinds].join(", ") : undefined,
        city: filters.city !== "all" ? filters.city : undefined,
        country: filters.country !== "all" ? filters.country : undefined,
        tags: filters.tags,
        vibes: filters.vibes,
        rating: filters.rating > 0 ? filters.rating : undefined,
        visitStatus: shelf === null ? filters.visitStatus : new Set<string>(),
        hasPhotosOnly: filters.hasPhotosOnly ? true : undefined,
      }}
      onRemoveFilter={(key) => {
        const reset: Record<string, Partial<LibraryFilterState>> = {
          kind: { kinds: new Set() }, city: { city: "all" }, country: { country: "all" }, tags: { tags: new Set() },
          vibes: { vibes: new Set() }, rating: { rating: 0 }, visitStatus: { visitStatus: new Set() }, hasPhotosOnly: { hasPhotosOnly: false },
        }
        if (reset[key]) update(reset[key])
      }}
    />
  )

  const filtersButton = (
    <PlaceFiltersSidebar
      mode="sheet"
      triggerClassName={`${viewBarPill} gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5`}
      filters={{
        kinds: filters.kinds,
        vibes: filters.vibes,
        tags: filters.tags,
        rating: filters.rating,
        visitStatus: filters.visitStatus,
        hasPhotosOnly: filters.hasPhotosOnly,
      }}
      filterOptions={filterOptions}
      onChange={(u) => update({ ...u })}
      onClear={() => setFilters((f) => ({ ...EMPTY_FILTERS, search: f.search }))}
    />
  )

  // Today's selection toolbar, unchanged; it rides in the sticky bar while selecting.
  const selectionToolbar = selecting ? (
    <LibraryToolbar
      className="border-b-0 border-t bg-transparent px-4 py-2 backdrop-blur-none sm:px-8"
      selectedCount={selected.size}
      totalCount={sorted.length}
      isAllSelected={selected.size === sorted.length && sorted.length > 0}
      isSomeSelected={selected.size > 0 && selected.size < sorted.length}
      onArchiveSelected={() => actions.archive([...selected])}
      onDeleteSelected={() => actions.remove([...selected])}
      onAddToCollectionSelected={() => {}}
      addToCollectionDisabled
      addToCollectionTitle="Add to collection — coming soon"
      onSelectAll={selectAll}
      onSelectNone={selectNone}
      showKeyboardHints={showKeyboardHints}
      onToggleKeyboardHints={() => setShowKeyboardHints((v) => !v)}
      disabled={busy}
      loading={busy}
    />
  ) : null

  const empty = items.length === 0
  const showTrips = !sparse && !filtering && view !== "map" && collections.length > 0

  return (
    <LibraryActionsContext.Provider value={actions}>
      {empty || sparse ? <SparseCover total={items.length} countries={stats.countries} /> : <LibraryCover items={items} stats={stats} onShelf={setShelf} onGroup={setGroup} />}

      {!empty && (
        <div className="-mt-[26px] px-4 sm:-mt-[34px] sm:px-8">
          <LibrarySearchPill ref={searchRef} value={filters.search} onChange={(search) => update({ search })} />
        </div>
      )}

      {!empty && !sparse && (
        <div className="px-4 pt-4 sm:px-8 sm:pt-[22px]">
          <LibraryShelves
            active={shelf}
            inboxCount={inboxCount}
            onShelf={setShelf}
            counts={{ all: stats.total, not_visited: stats.dreaming, planned: stats.planned, visited: stats.been }}
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
          <LibraryViewBar
            showGroup={!sparse}
            group={group}
            onGroup={setGroup}
            filtersSlot={filtersButton}
            chips={chips}
            shownCount={sorted.length}
            totalCount={items.length}
            sort={sort}
            onSort={setSort}
            view={view}
            onView={setView}
            exportLabel={selected.size ? `Export (${selected.size})` : "Export"}
            exportDisabled={selected.size === 0 && sorted.length === 0}
            isExporting={isExporting}
            onExport={handleExport}
            selecting={selecting}
            onSelectToggle={() => (selecting ? selectNone() : setSelectMode(true))}
            below={selectionToolbar}
          />

          {sorted.length === 0 ? (
            <NoMatches filters={filters} onClear={clearFilters} />
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
              interlude={showTrips ? <TripsShelf collections={collections} byId={byId} now={now} /> : null}
            />
          )}
        </div>
      )}

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

      <AlertDialog open={pending?.kind === "archive"} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {pending?.ids.length} Place(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the selected places to your archive. You can restore them later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button onClick={() => pending && runBulk("archive", pending.ids)} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
              {busy ? "Archiving..." : "Archive"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pending?.kind === "delete"} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently Delete {pending?.ids.length} Place(s)?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block font-semibold text-destructive">This action cannot be undone.</span>
              <span className="block">These places will be completely removed from the database, including all associated data.</span>
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
              onClick={() => pending && runBulk("delete", pending.ids)}
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
      <InviteTile icon={Upload} title="Drop screenshots" sub="Mass upload turns them into places" href="/mass-upload" />
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
        Chapters, the index and your trips shelf appear once there are enough places to organise — about a dozen.
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

function NoMatches({ filters, onClear }: { filters: LibraryFilterState; onClear: () => void }) {
  const parts = [
    filters.search.trim() && `“${filters.search.trim()}”`,
    filters.kinds.size && [...filters.kinds].join(" or "),
    filters.visitStatus.size && [...filters.visitStatus].map((s) => ({ not_visited: "dreaming", visited: "been", planned: "planned" })[s] ?? s).join(" or "),
    filters.vibes.size && [...filters.vibes].join(", "),
    filters.rating > 0 && `${filters.rating}★ and up`,
    filters.hasPhotosOnly && "with a photo",
    filters.city !== "all" && filters.city,
    filters.country !== "all" && filters.country,
  ].filter(Boolean)
  return (
    <div className="flex flex-col items-center px-4 py-20 text-center">
      <SearchX className="h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 font-editorial text-4xl">Nothing in your atlas matches</h2>
      {parts.length > 0 && <p className="mt-2 max-w-md text-sm text-muted-foreground">Looking for {parts.join(" · ")}.</p>}
      <Button variant="outline" className="mt-5 rounded-full" onClick={onClear}>
        Clear filters
      </Button>
      {panelFilterCount(filters) > 0 && filters.search.trim() && (
        <p className="mt-3 text-xs text-muted-foreground">Clearing also empties the search box.</p>
      )}
    </div>
  )
}
