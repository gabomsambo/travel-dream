"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Check, Pencil } from "lucide-react"
import { useDebouncedCallback } from "@/hooks/use-auto-save"
import type { PlaceWithRelations } from "@/types/database"
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
  mobile: boolean
  open: (id: SectionId) => void
  close: () => Promise<void>
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
  return {
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
    lat: place.coords && Number.isFinite(place.coords.lat) ? String(place.coords.lat) : "",
    lon: place.coords && Number.isFinite(place.coords.lon) ? String(place.coords.lon) : "",
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

function patchFor(draft: PlaceDraft, key: keyof PlaceDraft): Record<string, unknown> {
  if (key === "lat" || key === "lon") {
    if (draft.lat.trim() === "" && draft.lon.trim() === "") return { coords: null }
    const lat = Number(draft.lat)
    const lon = Number(draft.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return {}
    return { coords: { lat, lon } }
  }
  return { [key]: draft[key] }
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

function usePlaceAutosave(placeId: string, onSaved: () => void) {
  const [status, setStatus] = React.useState<SaveStatus>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const pendingRef = React.useRef<Record<string, unknown>>({})
  const generationRef = React.useRef(0)
  const chainRef = React.useRef<Promise<boolean>>(Promise.resolve(true))
  const inFlightRef = React.useRef<Promise<boolean> | null>(null)
  const idleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
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
    try {
      const response = await fetch(`/api/places/${placeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        const message = data && typeof data.message === "string" ? data.message : "Couldn't save"
        throw new Error(message)
      }
      if (generation !== generationRef.current) return true
      setStatus("saved")
      onSavedRef.current()
      idleTimer.current = setTimeout(() => {
        if (generation === generationRef.current) setStatus("idle")
      }, 2000)
      return true
    } catch (err) {
      pendingRef.current = { ...body, ...pendingRef.current }
      if (generation === generationRef.current) {
        setStatus("error")
        setError(err instanceof Error ? err.message : "Couldn't save")
      }
      return false
    }
  }, [placeId])

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

  const update = React.useCallback((partial: Record<string, unknown>) => {
    if (Object.keys(partial).length === 0) return
    pendingRef.current = { ...pendingRef.current, ...partial }
    debounced()
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
    setStatus("error")
    setError(message)
  }, [])

  return { status, error, update, flush, noteSaved, noteError }
}

function SaveMark({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === "saving") return <span className="text-background/70">Saving…</span>
  if (status === "error") return <span role="alert" className="text-red-300">{error ?? "Save failed"}</span>
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
  if (!api.active || api.mobile) return null
  return (
    <div className="pointer-events-none sticky top-0 z-40 h-0">
      <div className="pointer-events-none flex justify-center px-4 pt-3">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-foreground py-1.5 pl-4 pr-1.5 text-sm text-background shadow-xl">
          <Pencil className="h-4 w-4" aria-hidden />
          <span className="font-medium">Editing</span>
          <span className="hidden text-background/60 sm:inline">Changes save as you type</span>
          <SaveMark status={api.status} error={api.error} />
          <button
            type="button"
            onClick={() => void api.close()}
            className="rounded-full bg-background px-4 py-1.5 font-semibold text-foreground"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function MobileSheet({ api }: { api: SectionEditApi }) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  React.useEffect(() => {
    if (!api.active || !api.mobile) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") void api.close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [api])

  if (!mounted || !api.active || !api.mobile) return null
  const label = SECTION_LABELS[api.active]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onMouseDown={() => void api.close()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${label}`}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-background p-5 pb-8 text-foreground shadow-2xl"
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
            {api.status === "error" && <span role="alert" className="text-destructive">{api.error ?? "Save failed"}</span>}
          </span>
        </div>
        <SectionEditor id={api.active} api={api} />
        <button
          type="button"
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
  children,
}: {
  place: PlaceWithRelations
  onRefresh: () => void
  children: React.ReactNode
}) {
  const mobile = useMobileSheet()
  const [active, setActive] = React.useState<SectionId | null>(null)
  const [draft, setDraft] = React.useState<PlaceDraft>(() => draftFrom(place))
  const save = usePlaceAutosave(place.id, onRefresh)
  const placeIdRef = React.useRef(place.id)

  React.useEffect(() => {
    if (placeIdRef.current !== place.id) {
      placeIdRef.current = place.id
      setDraft(draftFrom(place))
      setActive(null)
    }
  }, [place])

  const setField = React.useCallback(<K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value }
      save.update(patchFor(next, key))
      return next
    })
  }, [save])

  const close = React.useCallback(async () => {
    const ok = await save.flush()
    if (ok) setActive(null)
  }, [save])

  const api = React.useMemo<SectionEditApi>(() => ({
    active,
    mobile,
    open: setActive,
    close,
    status: save.status,
    error: save.error,
    draft,
    setField,
    place,
    refresh: onRefresh,
    noteSaved: save.noteSaved,
    noteError: save.noteError,
  }), [active, mobile, close, save.status, save.error, save.noteSaved, save.noteError, draft, setField, place, onRefresh])

  return (
    <SectionEditContext.Provider value={api}>
      <EditingBar api={api} />
      {children}
      <MobileSheet api={api} />
    </SectionEditContext.Provider>
  )
}

/** Pencil for one section. Hidden until hover from the `lg` breakpoint up; always visible below that. */
export function SectionPencilSlot({ id }: { id: SectionId }) {
  const api = useSectionEdit()
  if (!api) return null
  return (
    <button
      type="button"
      aria-label={`Edit ${SECTION_LABELS[id]}`}
      onClick={() => api.open(id)}
      className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground opacity-100 transition hover:bg-secondary hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
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
