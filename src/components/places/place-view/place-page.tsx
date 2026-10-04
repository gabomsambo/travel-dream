"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { editorialFont } from "@/components/explore/fonts"
import type { PlaceWithRelations } from "@/types/database"
import { PlaceView } from "./place-view"

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
 * /place/[id]: opens in the read view; the existing editor is one Edit away and returns
 * with Done. Saves refresh the server data, so the view always shows what was saved.
 */
export function PlacePage({ place }: { place: PlaceWithRelations }) {
  const router = useRouter()
  const [mode, setMode] = React.useState<"view" | "edit">("view")

  const enterEdit = React.useCallback(() => setMode("edit"), [])
  const exitEdit = React.useCallback(() => {
    setMode("view")
    router.refresh()
  }, [router])

  React.useEffect(() => {
    document.querySelector("main")?.scrollTo({ top: 0 })
  }, [mode])

  if (mode === "edit") {
    return <PlaceFullView initialPlace={place} onDone={exitEdit} />
  }

  return (
    // Edge to edge like Explore: inline-size containment keeps the full-bleed hero from
    // widening the (app) shell's flex column, and -m-3 matches the shell's mobile padding.
    <div className={`${editorialFont.variable} -m-3 min-h-full pb-24 [contain:inline-size] sm:-m-6`}>
      <PlaceView place={place} onEdit={enterEdit} onPrefetchEdit={loadEditor} onPhotoAttached={() => router.refresh()} />
    </div>
  )
}
