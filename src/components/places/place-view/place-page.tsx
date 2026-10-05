"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { editorialFont } from "@/components/explore/fonts"
import type { PlaceWithRelations } from "@/types/database"
import { PlaceView, type PlaceViewHandles } from "./place-view"

// The editor is most of this route's JavaScript and most visits only read, so it loads
// on demand (and is warmed when the pointer reaches Edit).
const loadEditor = () => import("@/components/places/place-full-view")
const PlaceFullView = dynamic(() => loadEditor().then((mod) => ({ default: mod.PlaceFullView })), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Opening the editor…
    </div>
  ),
})

/**
 * /place/[id]: opens in the read view (or the editor, with ?edit=1 or the "Open places in
 * edit mode" setting); the existing editor is one Edit away and returns with Done. Saves refresh the server data, so the view always shows what was saved.
 */
export function PlacePage({ place, startInEdit = false }: { place: PlaceWithRelations; startInEdit?: boolean }) {
  const router = useRouter()
  const [mode, setMode] = React.useState<"view" | "edit">(startInEdit ? "edit" : "view")
  const preferenceApplied = React.useRef(startInEdit)

  // The setting lives in localStorage, so it can only be read after mount. ?edit=1 is
  // already decided on the server and does not flash.
  React.useEffect(() => {
    if (preferenceApplied.current) return
    preferenceApplied.current = true
    try {
      const raw = window.localStorage.getItem("user-preferences")
      if (!raw) return
      const prefs = JSON.parse(raw) as { openPlacesInEditMode?: boolean }
      if (prefs.openPlacesInEditMode) setMode("edit")
    } catch {
      // A broken preferences blob should not trap the page in the editor.
    }
  }, [])
  const viewHandlesRef = React.useRef<PlaceViewHandles | null>(null)
  const [editSeed, setEditSeed] = React.useState<PlaceWithRelations | null>(null)

  // A one-tap status write or a section-pencil edit left in flight when Edit is pressed must
  // settle before the editor mounts, or the editor's full-record save would silently revert it.
  const enterEdit = React.useCallback(async () => {
    await viewHandlesRef.current?.flushStatus()
    if (viewHandlesRef.current && !(await viewHandlesRef.current.flushSections())) return
    setEditSeed(viewHandlesRef.current?.displayPlace() ?? null)
    setMode("edit")
  }, [])
  const exitEdit = React.useCallback(() => {
    setMode("view")
    router.refresh()
  }, [router])

  React.useEffect(() => {
    document.querySelector("main")?.scrollTo({ top: 0 })
  }, [mode])

  const editPlace = editSeed
    ? { ...editSeed, reservations: place.reservations, links: place.links, attachments: place.attachments }
    : place

  if (mode === "edit") {
    return <PlaceFullView initialPlace={editPlace} onDone={exitEdit} />
  }

  return (
    // Edge to edge like Explore: inline-size containment keeps the full-bleed hero from
    // widening the (app) shell's flex column, and -m-3 matches the shell's mobile padding.
    <div className={`${editorialFont.variable} -m-3 min-h-full pb-24 [contain:inline-size] sm:-m-6`}>
      <PlaceView place={place} onEdit={() => void enterEdit()} onPrefetchEdit={loadEditor} onPhotoAttached={() => router.refresh()} handlesRef={viewHandlesRef} />
    </div>
  )
}
