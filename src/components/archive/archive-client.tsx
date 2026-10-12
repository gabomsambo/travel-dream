"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Archive as ArchiveIcon, Loader2, RotateCcw, Trash2 } from "lucide-react"
import { notify } from "@/lib/notify"
import { ActiveFilterChips } from "@/components/library/active-filter-chips"
import { viewBarPill } from "@/components/library/library-view-bar"
import { PlaceFiltersSidebar } from "@/components/library-v2/place-filters-sidebar"
import { EmptyState } from "@/components/library-v2/empty-state"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/adapters/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDebounce } from "@/hooks/use-debounce"
import { cityFilterLabels } from "@/lib/city-names"
import { parseFilters, type LibraryFilterState } from "@/lib/library/filters"
import { fuzzySearch, initializeSearchIndex } from "@/lib/search-service"
import {
  archiveSearchParams,
  filterArchive,
  parseArchiveSort,
  parseArchiveView,
  sortArchive,
  type ArchivePlace,
  type ArchiveView,
} from "@/lib/archive/view"
import type { ExportFormat } from "@/types/export"
import { ArchiveGallery } from "./archive-gallery"
import { ArchiveJournal } from "./archive-journal"
import { ArchiveList } from "./archive-list"
import { ArchiveToolbar } from "./archive-toolbar"
import { ArchiveViewBar } from "./archive-view-bar"

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable
}

export function ArchiveClient({ places: initialPlaces }: { places: ArchivePlace[] }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Ids hidden the moment restore or delete is confirmed, before the server answers.
  const [gone, setGone] = useState<string[]>([])
  const places = initialPlaces.filter((place) => !gone.includes(place.id))
  const [filters, setFilters] = useState<LibraryFilterState>(() => parseFilters(new URLSearchParams(searchParams.toString())))
  const [view, setView] = useState<ArchiveView>(() => parseArchiveView(searchParams.get("view")))
  const [sort, setSort] = useState(() => parseArchiveSort(searchParams.get("sort")))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<{ kind: "restore" | "delete"; ids: string[] } | null>(null)
  const [confirmText, setConfirmText] = useState("")
  const [busy, setBusy] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const debouncedSearch = useDebounce(filters.search, 300)

  useEffect(() => {
    setGone((prev) => prev.filter((id) => initialPlaces.some((place) => place.id === id)))
  }, [initialPlaces])

  useEffect(() => {
    initializeSearchIndex(places)
  }, [places])

  useEffect(() => {
    const qs = archiveSearchParams({ ...filters, search: debouncedSearch }, { view, sort }).toString()
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
  }, [filters, debouncedSearch, view, sort, pathname])

  const searchIds = useMemo(
    () => (filters.search.trim() ? new Set(fuzzySearch(filters.search).map((r) => r.place.id)) : null),
    [filters.search]
  )
  const filtered = useMemo(() => filterArchive(places, filters, searchIds), [places, filters, searchIds])
  const sorted = useMemo(() => sortArchive(filtered, sort), [filtered, sort])

  const filterOptions = useMemo(
    () => ({
      kinds: [...new Set(places.map((p) => p.kind))].sort(),
      cities: cityFilterLabels(places.map((p) => p.city)),
      countries: [...new Set(places.map((p) => p.country).filter((c): c is string => !!c))].sort(),
      tags: [...new Set(places.flatMap((p) => p.tags))].sort(),
      vibes: [...new Set(places.flatMap((p) => p.vibes))].sort(),
    }),
    [places]
  )

  const update = useCallback((patch: Partial<LibraryFilterState>) => setFilters((f) => ({ ...f, ...patch })), [])
  const clearFilters = useCallback(
    () => setFilters((f) => ({
      ...f,
      kinds: new Set(),
      cities: new Set(),
      countries: new Set(),
      tags: new Set(),
      vibes: new Set(),
      rating: 0,
      visitStatus: new Set(),
      photo: "any",
    })),
    []
  )

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const selectAll = useCallback(() => setSelected(new Set(sorted.map((p) => p.id))), [sorted])
  const selectNone = useCallback(() => setSelected(new Set()), [])

  const askRestore = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setPending({ kind: "restore", ids })
  }, [])
  const askDelete = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setConfirmText("")
    setPending({ kind: "delete", ids })
  }, [])

  const run = useCallback(async (kind: "restore" | "delete", ids: string[]) => {
    setBusy(true)
    setGone((prev) => [...new Set([...prev, ...ids])])
    try {
      const response = await fetch("/api/places/bulk-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: kind, placeIds: ids }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Failed to ${kind} places`)
      }
      const result = await response.json()
      const count = result.result?.updatedCount || ids.length
      notify.success(kind === "restore" ? `Restored ${count} place(s) to library` : `Permanently deleted ${count} place(s)`)
      setPending(null)
      setConfirmText("")
      setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))))
      router.refresh()
    } catch (error) {
      setGone((prev) => prev.filter((id) => !ids.includes(id)))
      notify.error(error instanceof Error ? error.message : `Failed to ${kind} places`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }, [router])

  const exportPlaces = useCallback(async (format: ExportFormat) => {
    if (selected.size === 0) return
    setIsExporting(true)
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: { type: "selected", placeIds: [...selected] },
          format,
          preset: "standard",
        }),
      })
      if (!response.ok) throw new Error("Export failed")
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `archive_export.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      notify.success(`Exported ${selected.size} place(s)`)
    } catch {
      notify.error("Failed to export places")
    } finally {
      setIsExporting(false)
    }
  }, [selected])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if (document.querySelector('[role="alertdialog"][data-state="open"], [role="menu"]')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault()
        selectAll()
        return
      }
      if (e.key === "Escape") {
        selectNone()
        return
      }
      if (mod || e.shiftKey || e.altKey) return
      if (e.key === "r") {
        e.preventDefault()
        askRestore([...selected])
      } else if (e.key === "d") {
        e.preventDefault()
        askDelete([...selected])
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected, selectAll, selectNone, askRestore, askDelete])

  const filtering = Boolean(filters.search.trim()) || filters.kinds.size > 0 || filters.cities.size > 0 || filters.countries.size > 0 || filters.tags.size > 0 || filters.vibes.size > 0 || filters.rating > 0 || filters.visitStatus.size > 0 || filters.photo !== "any"
  const isAllSelected = selected.size === sorted.length && sorted.length > 0
  const isSomeSelected = selected.size > 0 && selected.size < sorted.length

  const chips = (
    <ActiveFilterChips
      filters={{
        kinds: filters.kinds,
        tags: filters.tags,
        vibes: filters.vibes,
        rating: filters.rating > 0 ? filters.rating : undefined,
        visitStatus: filters.visitStatus,
        hasPhotosOnly: filters.photo === "with" ? true : undefined,
        city: filters.cities.size > 0 ? filters.cities : undefined,
        country: filters.countries.size > 0 ? filters.countries : undefined,
      }}
      onRemoveFilter={(key) => {
        const reset: Record<string, Partial<LibraryFilterState>> = {
          kinds: { kinds: new Set() },
          kind: { kinds: new Set() },
          tags: { tags: new Set() },
          vibes: { vibes: new Set() },
          rating: { rating: 0 },
          visitStatus: { visitStatus: new Set() },
          hasPhotosOnly: { photo: "any" },
          city: { cities: new Set() },
          country: { countries: new Set() },
        }
        if (reset[key]) update(reset[key])
      }}
    />
  )

  const viewProps = {
    places: sorted,
    selected,
    onToggle: toggle,
    onRestore: (id: string) => askRestore([id]),
    onDelete: (id: string) => askDelete([id]),
  }

  return (
    <div>
      <header className="px-4 pb-2 pt-6 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">Archive</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Places you set aside. Restore them, or delete them for good.
        </p>
      </header>

      {places.length === 0 ? (
        <div className="px-4 py-10 sm:px-8">
          <EmptyState
            icon={ArchiveIcon}
            title="No archived places"
            description="You haven't archived any places yet. Archived places will appear here."
          />
        </div>
      ) : (
        <>
          <ArchiveViewBar
            search={filters.search}
            onSearch={(search) => update({ search })}
            filtersSlot={
              <PlaceFiltersSidebar
                mode="sheet"
                triggerClassName={`${viewBarPill} gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5`}
                filters={{
                  kinds: filters.kinds,
                  vibes: filters.vibes,
                  tags: filters.tags,
                  rating: filters.rating,
                  visitStatus: filters.visitStatus,
                  hasPhotosOnly: filters.photo === "with",
                }}
                filterOptions={filterOptions}
                onChange={(u) => {
                  const { hasPhotosOnly, ...rest } = u
                  update({
                    ...rest,
                    ...(hasPhotosOnly === undefined ? {} : { photo: hasPhotosOnly ? "with" : "any" }),
                  })
                }}
                onClear={clearFilters}
              />
            }
            chips={chips}
            shownCount={sorted.length}
            totalCount={places.length}
            sort={sort}
            onSort={setSort}
            view={view}
            onView={setView}
          />

          <div className={cnPad}>
            {sorted.length === 0 ? (
              <EmptyState
                icon={ArchiveIcon}
                title="No archived places"
                description={filtering
                  ? "No places match your current filters. Try adjusting your search criteria."
                  : "You haven't archived any places yet. Archived places will appear here."}
              />
            ) : view === "grid" ? (
              <ArchiveGallery {...viewProps} />
            ) : view === "journal" ? (
              <ArchiveJournal {...viewProps} />
            ) : (
              <ArchiveList {...viewProps} />
            )}
          </div>
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur sm:sticky sm:bottom-0">
          <ArchiveToolbar
            className="border-0 bg-transparent"
            selectedCount={selected.size}
            totalCount={sorted.length}
            isAllSelected={isAllSelected}
            isSomeSelected={isSomeSelected}
            onRestoreSelected={() => askRestore([...selected])}
            onDeleteSelected={() => askDelete([...selected])}
            onExportSelected={exportPlaces}
            onSelectAll={selectAll}
            onSelectNone={selectNone}
            isExporting={isExporting}
            disabled={busy}
            loading={busy}
          />
        </div>
      )}

      <AlertDialog open={pending?.kind === "restore"} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {pending?.ids.length} Place(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the selected places back to your library. You can archive them again later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              onClick={() => pending && run("restore", pending.ids)}
              disabled={busy}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              {busy ? "Restoring..." : "Restore to Library"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pending?.kind === "delete"} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Permanently Delete {pending?.ids.length} Place(s)?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block font-semibold text-destructive">This cannot be undone.</span>
              <span className="block">
                This deletes the place, its notes, and its stop on any trip. Links and reservations stored on it go with it.
                Photo files already uploaded stay in storage, and the original screenshot or source stays in your account, no longer linked to this place.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <Label htmlFor="confirm-text">Type &quot;confirm&quot; to proceed:</Label>
            <Input
              id="confirm-text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="confirm"
              autoFocus
              disabled={busy}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => pending && run("delete", pending.ids)}
              disabled={confirmText.toLowerCase() !== "confirm" || busy}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {busy ? "Deleting..." : "Delete Permanently"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const cnPad = "px-4 py-4 pb-28 sm:px-8"

export default ArchiveClient
