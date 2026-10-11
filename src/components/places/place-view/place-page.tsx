"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { editorialFont } from "@/components/explore/fonts"
import type { ExploreCollection, ExplorePlace } from "@/lib/explore/types"
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

type PlaceMode = "view" | "postcard" | "classic"

function clearEditorQuery(replace: (href: string, options?: { scroll?: boolean }) => void) {
  const url = new URL(window.location.href)
  if (!url.searchParams.has("edit") && !url.searchParams.has("editor")) return
  replace(url.pathname, { scroll: false })
}

/**
 * /place/[id]: opens on the Postcard. Edit, ?edit=1 and "Open places in edit mode" turn that
 * same page into Postcard edit mode. The pre-redesign form stays at ?editor=classic and
 * More → Open classic editor. Done only leaves; a failed save stays put.
 */
export function PlacePage({
  place,
  trips = [],
  alsoIn = [],
  startInEdit = false,
  startClassic = false,
}: {
  place: PlaceWithRelations
  trips?: ExploreCollection[]
  alsoIn?: ExplorePlace[]
  startInEdit?: boolean
  startClassic?: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = React.useState<PlaceMode>(startClassic ? "classic" : startInEdit ? "postcard" : "view")
  const preferenceApplied = React.useRef(startInEdit || startClassic)

  // The setting lives in localStorage, so it can only be read after mount. ?edit=1 is
  // already decided on the server and does not flash. Classic is an explicit URL, not a setting.
  React.useEffect(() => {
    if (preferenceApplied.current) return
    preferenceApplied.current = true
    try {
      const raw = window.localStorage.getItem("user-preferences")
      if (!raw) return
      const prefs = JSON.parse(raw) as { openPlacesInEditMode?: boolean }
      if (prefs.openPlacesInEditMode) setMode("postcard")
    } catch {
      // A broken preferences blob should not trap the page in the editor.
    }
  }, [])
  const viewHandlesRef = React.useRef<PlaceViewHandles | null>(null)
  const [editSeed, setEditSeed] = React.useState<PlaceWithRelations | null>(null)

  const leaveToView = React.useCallback(() => {
    setMode("view")
    clearEditorQuery((href, options) => router.replace(href, options))
    router.refresh()
  }, [router])

  // The classic form saves a full snapshot, so anything still in flight has to land first.
  const enterClassic = React.useCallback(async () => {
    await viewHandlesRef.current?.flushStatus()
    if (viewHandlesRef.current && !(await viewHandlesRef.current.flushSections())) return
    const seeded = viewHandlesRef.current?.displayPlace() ?? place
    if (!seeded.name.trim()) return
    setEditSeed(seeded)
    setMode("classic")
    const url = new URL(window.location.href)
    url.searchParams.delete("edit")
    url.searchParams.set("editor", "classic")
    router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false })
    document.querySelector("main")?.scrollTo({ top: 0 })
  }, [place, router])

  const editPlace = editSeed
    ? { ...editSeed, reservations: place.reservations, links: place.links, attachments: place.attachments }
    : place

  if (mode === "classic") {
    return <PlaceFullView initialPlace={editPlace} onDone={leaveToView} />
  }

  return (
    // Edge to edge like Explore: inline-size containment keeps the full-bleed hero from
    // widening the (app) shell's flex column, and -m-3 matches the shell's mobile padding.
    <div className={`${editorialFont.variable} -m-3 min-h-full pb-24 [contain:inline-size] sm:-m-6`}>
      <PlaceView
        place={place}
        trips={trips}
        alsoIn={alsoIn}
        editing={mode === "postcard"}
        onEdit={() => setMode("postcard")}
        onDoneEditing={leaveToView}
        onOpenClassic={() => void enterClassic()}
        onPrefetchEdit={loadEditor}
        onPhotoAttached={() => router.refresh()}
        handlesRef={viewHandlesRef}
      />
    </div>
  )
}
