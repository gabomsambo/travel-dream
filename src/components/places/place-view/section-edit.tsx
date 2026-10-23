"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Check, Pencil } from "lucide-react"
import { useDebouncedCallback } from "@/hooks/use-auto-save"
import type { PlaceWithRelations } from "@/types/database"
import { usablePin } from "@/lib/place-coords"
import { SectionEditor } from "./section-editors"

export type SectionId = "why" | "about" | "know" | "photos" | "links" | "plan" | "ground"

export const SECTION_LABELS: Record<SectionId, string> = {
  why: "Why it's here",
  about: "About",
  know: "Good to know",
  photos: "Photos",
  links: "Links & reading",
  plan: "Your plan",
  ground: "On the ground",
}

export interface PlaceDraft {
  name: string
  kind: string
  notes: string
  recommendedBy: string
  description: string
  altNames: string[]
  best_time: string
  price_level: string
  activities: string[]
  cuisine: string[]
  amenities: string[]
  tags: string[]
  vibes: string[]
  practicalInfo: string
  address: string
  city: string
  admin: string
  country: string
  lat: string
  lon: string
  hours: Record<string, string> | null
  website: string
  phone: string
  email: string
  priority: number
  plannedVisit: string
  lastVisited: string
  companions: string[]
  ratingSelf: number
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

export interface SectionEditApi {
  active: SectionId | null
  /** Page-level Postcard edit. Section pencils stay available when this is false. */
  editingAll: boolean
  mobile: boolean
  open: (id: SectionId) => void
  close: () => Promise<void>
  /** Flush and leave Postcard edit. Stays put when the last save failed. */
  exitEditing: () => Promise<boolean>
  status: SaveStatus
  error: string | null
  draft: PlaceDraft
  setField: <K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) => void
  place: PlaceWithRelations
  refresh: () => void
  noteSaved: () => void
  noteError: (message: string) => void
}

const SectionEditContext = React.createContext<SectionEditApi | null>(null)

export function useSectionEdit(): SectionEditApi | null {
  return React.useContext(SectionEditContext)
}

function draftFrom(place: PlaceWithRelations): PlaceDraft {
  const hours = place.hours && typeof place.hours === "object" ? (place.hours as Record<string, string>) : null
  const pin = usablePin(place.coords)
  return {
    name: place.name ?? "",
    kind: place.kind ?? "tip",
    notes: place.notes ?? "",
    recommendedBy: place.recommendedBy ?? "",
    description: place.description ?? "",
    altNames: place.altNames ?? [],
    best_time: place.best_time ?? "",
    price_level: place.price_level ?? "",
    activities: place.activities ?? [],
    cuisine: place.cuisine ?? [],
    amenities: place.amenities ?? [],
    tags: place.tags ?? [],
    vibes: place.vibes ?? [],
    practicalInfo: place.practicalInfo ?? "",
    address: place.address ?? "",
    city: place.city ?? "",
    admin: place.admin ?? "",
    country: place.country ?? "",
    lat: pin ? String(pin.lat) : "",
    lon: pin ? String(pin.lon) : "",
    hours,
    website: place.website ?? "",
    phone: place.phone ?? "",
    email: place.email ?? "",
    priority: place.priority ?? 0,
    plannedVisit: place.plannedVisit?.slice(0, 10) ?? "",
    lastVisited: place.lastVisited?.slice(0, 10) ?? "",
    companions: place.companions ?? [],
    ratingSelf: place.ratingSelf ?? 0,
  }
}

/** The place with the section fields the user changed laid over it, so a seed taken mid-edit carries what was typed. */
function placeWithDraft(place: PlaceWithRelations, draft: PlaceDraft, dirty: ReadonlySet<keyof PlaceDraft>): PlaceWithRelations {
  let coords = place.coords
  if (draft.lat.trim() === "" && draft.lon.trim() === "") {
    coords = null
  } else if (Number.isFinite(Number(draft.lat)) && Number.isFinite(Number(draft.lon))) {
    coords = { lat: Number(draft.lat), lon: Number(draft.lon) }
  }
  const overlay: Partial<PlaceWithRelations> = {
    name: draft.name,
    kind: draft.kind,
    notes: draft.notes,
    recommendedBy: draft.recommendedBy || null,
    description: draft.description,
    altNames: draft.altNames,
    best_time: draft.best_time || null,
    price_level: draft.price_level || null,
    activities: draft.activities,
    cuisine: draft.cuisine,
    amenities: draft.amenities,
    tags: draft.tags,
    vibes: draft.vibes,
    practicalInfo: draft.practicalInfo,
    address: draft.address || null,
    city: draft.city || null,
    admin: draft.admin || null,
    country: draft.country || null,
    coords,
    hours: draft.hours,
    website: draft.website || null,
    phone: draft.phone || null,
    email: draft.email || null,
    priority: draft.priority,
    plannedVisit: draft.plannedVisit || null,
    lastVisited: draft.lastVisited || null,
    companions: draft.companions,
    ratingSelf: draft.ratingSelf,
  }
  const picked: Record<string, unknown> = {}
  dirty.forEach((key) => {
    const field = key === "lat" || key === "lon" ? "coords" : key
    picked[field] = overlay[field]
  })
  return { ...place, ...picked }
}

/** The place with every section draft field laid over it, for edit-mode display. */
export function applyDraft(place: PlaceWithRelations, draft: PlaceDraft): PlaceWithRelations {
  return placeWithDraft(place, draft, new Set(Object.keys(draft) as Array<keyof PlaceDraft>))
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Imperative access for the page shell before it swaps the view for the full editor. */
export interface SectionEditHandles {
  /** Resolves true once every section edit is saved; false if a save failed. */
  flush: () => Promise<boolean>
  /** `place` with the section edits applied. */
  withDraft: (place: PlaceWithRelations) => PlaceWithRelations
}

interface FieldPatch {
  set: Record<string, unknown>
  drop: string[]
}

function patchFor(draft: PlaceDraft, key: keyof PlaceDraft): FieldPatch {
  if (key === "name") {
    const name = draft.name.trim()
    return name ? { set: { name }, drop: [] } : { set: {}, drop: ["name"] }
  }
  if (key === "lat" || key === "lon") {
    if (draft.lat.trim() === "" && draft.lon.trim() === "") return { set: { coords: null }, drop: [] }
    const lat = Number(draft.lat)
    const lon = Number(draft.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { set: {}, drop: [] }
    return { set: { coords: { lat, lon } }, drop: [] }
  }
  return { set: { [key]: draft[key] }, drop: [] }
}

function keysDraftWouldDrop(draft: PlaceDraft): string[] {
  const dropped: string[] = []
  for (const key of Object.keys(draft) as Array<keyof PlaceDraft>) {
    dropped.push(...patchFor(draft, key).drop)
  }
  return dropped
}

function restoreFailedSave(
  snapshot: Record<string, unknown>,
  pending: Record<string, unknown>,
  draft: PlaceDraft | null,
  restoreName: string | null,
): Record<string, unknown> {
  const restored = { ...snapshot }
  if (draft) {
    for (const field of keysDraftWouldDrop(draft)) delete restored[field]
    const trimmed = draft.name.trim()
    if ("name" in restored && (trimmed === "" || restored.name !== trimmed)) delete restored.name
  }
  const merged = { ...restored, ...pending }
  if (restoreName && draft && draft.name.trim() === "" && typeof merged.name !== "string") {
    merged.name = restoreName
  }
  return merged
}

function focusSectionRow(returnTo: HTMLElement) {
  const section = returnTo.getAttribute("data-edit-section")
  if (!section || !Object.prototype.hasOwnProperty.call(SECTION_LABELS, section)) return
  document.querySelector<HTMLElement>(`[data-edit-section="${section}"][data-edit-section-row]`)?.focus()
}

function focusAbandoned(returnTo: HTMLElement): boolean {
  const active = document.activeElement
  if (!active || active === document.body || active === document.documentElement) return true
  return active === returnTo || (active instanceof HTMLElement && !active.isConnected)
}

function focusOpener(returnTo: HTMLElement | null) {
  if (!returnTo) return
  if (returnTo.isConnected) {
    returnTo.focus()
    return
  }
  focusSectionRow(returnTo)
}

function useMobileSheet(): boolean {
  const [mobile, setMobile] = React.useState(false)
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(max-width: 1023px)")
    const apply = () => setMobile(mq.matches)
    apply()
    mq.addEventListener?.("change", apply)
    return () => mq.removeEventListener?.("change", apply)
  }, [])
  return mobile
}

function usePlaceAutosave(
  placeId: string,
  onSaved: () => void,
  draftRef: React.RefObject<PlaceDraft>,
  lastAcceptedNameRef: React.MutableRefObject<string>,
) {
  const [status, setStatus] = React.useState<SaveStatus>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const pendingRef = React.useRef<Record<string, unknown>>({})
  const generationRef = React.useRef(0)
  const chainRef = React.useRef<Promise<boolean>>(Promise.resolve(true))
  const inFlightRef = React.useRef<Promise<boolean> | null>(null)
  const idleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameRestoreRef = React.useRef<string | null>(null)
  const onSavedRef = React.useRef(onSaved)
  React.useEffect(() => {
    onSavedRef.current = onSaved
  }, [onSaved])

  React.useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
  }, [])

  const handleSave = React.useCallback(async (): Promise<boolean> => {
    const body = pendingRef.current
    if (Object.keys(body).length === 0) return true
    pendingRef.current = {}
    const generation = ++generationRef.current
    if (idleTimer.current) {
      clearTimeout(idleTimer.current)
      idleTimer.current = null
    }
    setStatus("saving")
    setError(null)
    const sendPatch = async (payload: Record<string, unknown>) => {
      const response = await fetch(`/api/places/${placeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        const message = data && typeof data.message === "string" ? data.message : "Couldn't save"
        throw new Error(message)
      }
    }
    try {
      await sendPatch(body)
      const sentName = typeof body.name === "string" ? body.name : undefined
      const trimmedDraft = draftRef.current?.name.trim() ?? ""
      if (sentName && trimmedDraft === "") {
        const revertTo = lastAcceptedNameRef.current.trim()
        if (revertTo && revertTo !== sentName) {
          nameRestoreRef.current = revertTo
          try {
            await sendPatch({ name: revertTo })
          } catch (revertErr) {
            if (typeof pendingRef.current.name !== "string") {
              pendingRef.current = { ...pendingRef.current, name: revertTo }
            }
            if (generation === generationRef.current) {
              setStatus("error")
              setError(revertErr instanceof Error ? revertErr.message : "Couldn't save")
            }
            return false
          }
        }
        nameRestoreRef.current = null
      } else if (sentName && trimmedDraft) {
        lastAcceptedNameRef.current = sentName
        nameRestoreRef.current = null
      } else if (trimmedDraft) {
        nameRestoreRef.current = null
      }
      if (generation !== generationRef.current) return true
      setStatus("saved")
      onSavedRef.current()
      idleTimer.current = setTimeout(() => {
        if (generation === generationRef.current) setStatus("idle")
      }, 2000)
      return true
    } catch (err) {
      pendingRef.current = restoreFailedSave(body, pendingRef.current, draftRef.current, nameRestoreRef.current)
      if (generation === generationRef.current) {
        setStatus("error")
        setError(err instanceof Error ? err.message : "Couldn't save")
      }
      return false
    }
  }, [placeId, draftRef, lastAcceptedNameRef])

  const runSave = React.useCallback(() => {
    const save = chainRef.current.then(() => handleSave())
    chainRef.current = save
    inFlightRef.current = save
    void save.then(() => {
      if (inFlightRef.current === save) inFlightRef.current = null
    })
    return save
  }, [handleSave])

  const debounced = useDebouncedCallback(runSave, 800)

  const update = React.useCallback((partial: FieldPatch) => {
    for (const key of partial.drop) {
      if (key === "name" && nameRestoreRef.current && pendingRef.current.name === nameRestoreRef.current) continue
      delete pendingRef.current[key]
    }
    if (typeof partial.set.name === "string" && partial.set.name.trim()) nameRestoreRef.current = null
    if (Object.keys(partial.set).length > 0) {
      pendingRef.current = { ...pendingRef.current, ...partial.set }
    }
    if (partial.drop.length === 0 && Object.keys(partial.set).length === 0) return
    if (Object.keys(pendingRef.current).length === 0) {
      debounced.cancel()
      return
    }
    debounced()
  }, [debounced])

  const cancel = React.useCallback(() => {
    debounced.cancel()
  }, [debounced])

  const flush = React.useCallback(async () => {
    debounced.cancel()
    let ok = true
    while (ok) {
      if (inFlightRef.current) {
        ok = await inFlightRef.current
        continue
      }
      if (Object.keys(pendingRef.current).length > 0) {
        ok = await runSave()
        continue
      }
      break
    }
    return ok
  }, [debounced, runSave])

  const noteSaved = React.useCallback(() => {
    setStatus("saved")
    setError(null)
    onSavedRef.current()
  }, [])

  const noteError = React.useCallback((message: string) => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current)
      idleTimer.current = null
    }
    setStatus("error")
    setError(message)
  }, [])

  return { status, error, update, flush, cancel, noteSaved, noteError }
}

function SaveMark({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === "saving") return <span className="text-background/70">Saving…</span>
  if (status === "error") return <span className="font-medium text-red-300">{error ?? "Couldn't save"}</span>
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-300">
        <Check className="h-3.5 w-3.5" aria-hidden /> Saved
      </span>
    )
  }
  return null
}

function EditingBar({ api }: { api: SectionEditApi }) {
  // Postcard edit keeps the bar up the whole time, including on a phone.
  // A single section pencil still hides it on a phone, where the sheet has its own Done.
  if (!api.editingAll && (!api.active || api.mobile)) return null
  const done = () => {
    if (api.editingAll) void api.exitEditing()
    else void api.close()
  }
  return (
    <div className="pointer-events-none sticky top-0 z-40 h-0">
      <div className="pointer-events-none flex justify-center px-3 pt-3">
        <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full bg-foreground py-1.5 pl-4 pr-1.5 text-sm text-background shadow-xl">
          <Pencil className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-medium">Editing</span>
          <span className="text-background/70">Changes save as you type</span>
          <SaveMark status={api.status} error={api.error} />
          <button
            type="button"
            onClick={done}
            className="rounded-full bg-background px-4 py-1.5 font-semibold text-foreground"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableIn(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1)
}

function MobileSheet({ api }: { api: SectionEditApi }) {
  const { active, mobile, close } = api
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  React.useEffect(() => {
    if (!mounted || !active || !mobile) return
    const node = dialogRef.current
    if (!node) return
    const initial = focusableIn(node)
    ;(initial[0] ?? node).focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        void close()
        return
      }
      if (event.key !== "Tab") return
      const items = focusableIn(node)
      if (items.length === 0) {
        event.preventDefault()
        node.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const inside = active instanceof Node && node.contains(active)
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [mounted, active, mobile, close])

  if (!mounted || !active || !mobile) return null
  const label = SECTION_LABELS[active]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onMouseDown={() => void api.close()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${label}`}
        tabIndex={-1}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-background p-5 pb-8 text-foreground shadow-2xl outline-none"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
        <div className="mb-4 flex items-center gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Edit</p>
            <p className="font-heading text-lg font-semibold">{label}</p>
          </div>
          <span className="ml-auto text-xs">
            {api.status === "saving" && <span className="text-muted-foreground">Saving…</span>}
            {api.status === "saved" && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Check className="h-3.5 w-3.5" aria-hidden /> Saved
              </span>
            )}
            {api.status === "error" && <span className="font-medium text-destructive">{api.error ?? "Couldn't save"}</span>}
          </span>
        </div>
        <SectionEditor id={active} api={api} />
        <button
          type="button"
          aria-label={`Done with ${label}`}
          onClick={() => void api.close()}
          className="mt-5 flex w-full items-center justify-center rounded-full bg-foreground py-3 text-sm font-semibold text-background"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  )
}

export function SectionEditProvider({
  place,
  onRefresh,
  handlesRef,
  editingAll = false,
  onExitEditing,
  blockWrites = false,
  children,
}: {
  place: PlaceWithRelations
  onRefresh: () => void
  handlesRef?: React.MutableRefObject<SectionEditHandles | null>
  editingAll?: boolean
  onExitEditing?: () => void
  blockWrites?: boolean
  children: React.ReactNode
}) {
  const mobile = useMobileSheet()
  const [active, setActive] = React.useState<SectionId | null>(null)
  const [draft, setDraft] = React.useState<PlaceDraft>(() => draftFrom(place))
  const draftRef = React.useRef(draft)
  const lastAcceptedNameRef = React.useRef((place.name ?? "").trim())
  const save = usePlaceAutosave(place.id, onRefresh, draftRef, lastAcceptedNameRef)
  const placeIdRef = React.useRef(place.id)
  const dirtyRef = React.useRef(new Set<keyof PlaceDraft>())
  const retractedNameRef = React.useRef(false)
  const openerRef = React.useRef<HTMLElement | null>(null)
  const watchedOpenerRef = React.useRef<HTMLElement | null>(null)
  const openerConnectedRef = React.useRef(false)
  const onExitRef = React.useRef(onExitEditing)
  React.useEffect(() => {
    onExitRef.current = onExitEditing
  }, [onExitEditing])

  React.useEffect(() => {
    draftRef.current = draft
  })

  React.useEffect(() => {
    const fresh = draftFrom(place)
    const dirty = dirtyRef.current
    if (placeIdRef.current !== place.id) {
      placeIdRef.current = place.id
      dirty.clear()
      retractedNameRef.current = false
      lastAcceptedNameRef.current = fresh.name.trim()
      draftRef.current = fresh
      setDraft(fresh)
      setActive(null)
      return
    }
    const current = draftRef.current
    const serverName = fresh.name.trim()
    if (!retractedNameRef.current && (!dirty.has("name") || current.name.trim() === serverName)) {
      lastAcceptedNameRef.current = serverName
    }
    const next: PlaceDraft = { ...fresh }
    dirty.forEach((key) => {
      if (sameValue(fresh[key], current[key])) {
        dirty.delete(key)
      } else {
        Object.assign(next, { [key]: current[key] })
      }
    })
    if (retractedNameRef.current && !dirty.has("name")) {
      next.name = current.name
    }
    draftRef.current = next
    setDraft(next)
  }, [place])

  React.useEffect(() => {
    if (!handlesRef) return
    handlesRef.current = {
      flush: save.flush,
      withDraft: (target) => {
        const seeded = placeWithDraft(target, draftRef.current, dirtyRef.current)
        if (!retractedNameRef.current) return seeded
        const accepted = lastAcceptedNameRef.current.trim()
        return accepted ? { ...seeded, name: accepted } : seeded
      },
    }
    return () => {
      handlesRef.current = null
    }
  }, [handlesRef, save.flush])

  const setField = React.useCallback(<K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) => {
    if (blockWrites) return
    const nameCleared = key === "name" && (typeof value !== "string" || value.trim() === "")
    if (key === "lat" || key === "lon") {
      dirtyRef.current.add("lat")
      dirtyRef.current.add("lon")
    } else if (nameCleared) {
      dirtyRef.current.delete("name")
      retractedNameRef.current = true
    } else {
      if (key === "name") retractedNameRef.current = false
      dirtyRef.current.add(key)
    }
    setDraft((prev) => {
      const next = { ...prev, [key]: value }
      draftRef.current = next
      save.update(patchFor(next, key))
      return next
    })
  }, [blockWrites, save])

  const cancelSave = save.cancel
  React.useLayoutEffect(() => {
    if (!blockWrites) return
    cancelSave()
    setActive(null)
  }, [blockWrites, cancelSave])

  const open = React.useCallback((id: SectionId) => {
    if (blockWrites) return
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setActive(id)
  }, [blockWrites])

  React.useLayoutEffect(() => {
    const returnTo = openerRef.current
    if (returnTo !== watchedOpenerRef.current) {
      watchedOpenerRef.current = returnTo
      openerConnectedRef.current = Boolean(returnTo?.isConnected)
      return
    }
    const connected = Boolean(returnTo?.isConnected)
    const disconnected = openerConnectedRef.current && !connected
    openerConnectedRef.current = connected
    if (!disconnected || !returnTo || !focusAbandoned(returnTo)) return
    focusOpener(returnTo)
  })

  const flushSave = save.flush
  const reportError = save.noteError

  const close = React.useCallback(async () => {
    const ok = await flushSave()
    if (!ok) return
    const returnTo = openerRef.current
    setActive(null)
    // Move focus before the sheet unmounts, or the browser drops it on document.body.
    focusOpener(returnTo)
  }, [flushSave])

  const exitEditing = React.useCallback(async () => {
    const ok = await flushSave()
    if (!ok) return false
    if (!draftRef.current.name.trim()) {
      reportError("Place name is required")
      return false
    }
    const returnTo = openerRef.current
    setActive(null)
    onExitRef.current?.()
    focusOpener(returnTo)
    return true
  }, [flushSave, reportError])

  const api = React.useMemo<SectionEditApi>(() => ({
    active,
    editingAll,
    mobile,
    open,
    close,
    exitEditing,
    status: save.status,
    error: save.error,
    draft,
    setField,
    place,
    refresh: onRefresh,
    noteSaved: save.noteSaved,
    noteError: save.noteError,
  }), [active, editingAll, mobile, open, close, exitEditing, save.status, save.error, save.noteSaved, save.noteError, draft, setField, place, onRefresh])

  return (
    <SectionEditContext.Provider value={api}>
      <div className="sr-only" role="status" aria-live="polite">
        {save.status === "saving" ? "Saving" : save.status === "saved" ? "Saved" : save.status === "error" ? (save.error ?? "Couldn't save") : ""}
      </div>
      <EditingBar api={api} />
      {children}
      <MobileSheet api={api} />
    </SectionEditContext.Provider>
  )
}

/** Pencil for one section. Always visible while editing, and on touch. A fine pointer may reveal it on hover. */
export function SectionPencilSlot({ id }: { id: SectionId }) {
  const api = useSectionEdit()
  if (!api) return null
  return (
    <button
      type="button"
      aria-label={`Edit ${SECTION_LABELS[id]}`}
      onClick={() => api.open(id)}
      className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground opacity-100 transition hover:bg-secondary hover:text-foreground ${api.editingAll ? "" : "[@media(hover:hover)]:lg:opacity-0 [@media(hover:hover)]:lg:group-hover:opacity-100 [@media(hover:hover)]:lg:focus-visible:opacity-100"}`}
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">Edit</span>
    </button>
  )
}

/** On a wide screen the section becomes its editor in the same place. On a narrow screen the read view stays. */
export function EditableSection({ id, read }: { id: SectionId; read: React.ReactNode }) {
  const api = useSectionEdit()
  if (api && api.active === id && !api.mobile) {
    return (
      <div className="rounded-2xl border border-primary/25 bg-primary/[0.03] p-5 ring-4 ring-primary/[0.04]">
        <SectionEditor id={id} api={api} />
      </div>
    )
  }
  return <>{read}</>
}
