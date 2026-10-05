"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { CalendarHeart, Coins, ImagePlus, MapPin, PenLine, Plus, Quote, Sunrise, type LucideIcon } from "lucide-react"
import { formatDateOnly } from "@/lib/place-view/format"
import { notify } from "@/lib/notify"
import type { Attachment, PlaceWithRelations } from "@/types/database"
import { PlaceHero } from "./place-hero"
import { About, GoodToKnow, Links, Photos, RecordInfo, SectionHeader, Sources, WhyItsHere } from "./place-sections"
import { OnTheGround, YourPlan } from "./place-rail"
import { EditableSection, SectionEditProvider } from "./section-edit"

const PhotoLightbox = dynamic(
  () => import("@/components/ui-custom/photo-lightbox").then((mod) => ({ default: mod.PhotoLightbox })),
  { ssr: false }
)

type VisitStatus = "not_visited" | "planned" | "visited"

/** Imperative access for the page shell: drain a pending status write, read what's shown. */
export interface PlaceViewHandles {
  /** Resolves once no one-tap visit-status write is in flight or queued. */
  flushStatus: () => Promise<void>
  /** The place as currently displayed, including a confirmed status override. */
  displayPlace: () => PlaceWithRelations
}

/** Cover first, then the rest in their stored order. */
export function orderedPhotos(attachments: Attachment[]): Attachment[] {
  const photos = attachments.filter((a) => a.type === "photo")
  const cover = photos.find((p) => p.isPrimary === 1) ?? photos[0]
  return cover ? [cover, ...photos.filter((p) => p !== cover)] : []
}

function Invitation({ icon: Icon, title, detail, onClick }: { icon: LucideIcon; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-dashed p-4 text-left transition hover:border-primary/50 hover:bg-primary/[0.03]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <Plus className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

/**
 * When the pipeline only found the basics, the empty sections stay hidden and what is
 * missing becomes a few invitations instead of a page of blank inputs.
 */
function MakeItYours({ place, hasPhotos, onEdit }: { place: PlaceWithRelations; hasPhotos: boolean; onEdit: () => void }) {
  const missing: Array<[LucideIcon, string, string]> = []
  if (!place.notes) missing.push([Quote, "Why did you save it?", "Your note becomes the quote at the top"])
  if (!hasPhotos) missing.push([ImagePlus, "Add a photo", "Upload one or find one for this place"])
  if (!place.address && !place.hours) missing.push([MapPin, "Address & hours", "So it's useful when you're there"])
  if (!place.description) missing.push([PenLine, "Describe it", "A line or two about the place"])
  if (missing.length < 2) return null

  return (
    <section aria-labelledby="place-make-it-yours">
      <SectionHeader eyebrow="Make it yours" title="Only the basics so far" id="place-make-it-yours" />
      <p className="mt-1 text-sm text-muted-foreground">Add what you remember. Each one fills in a part of this page.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {missing.map(([icon, title, detail]) => (
          <Invitation key={title} icon={icon} title={title} detail={detail} onClick={onEdit} />
        ))}
      </div>
    </section>
  )
}

function QuickFacts({ place }: { place: PlaceWithRelations }) {
  const planned = place.visitStatus === "planned" ? formatDateOnly(place.plannedVisit, { weekday: false, year: false }) : null
  const facts: Array<[LucideIcon, string]> = []
  if (planned) facts.push([CalendarHeart, planned])
  if (place.price_level) facts.push([Coins, place.price_level])
  if (place.best_time) facts.push([Sunrise, place.best_time])
  if (facts.length === 0) return null
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-1 hide-scrollbar sm:px-8 lg:hidden" aria-label="Quick facts">
      {facts.map(([Icon, text]) => (
        <span key={text} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium">
          <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
          {text}
        </span>
      ))}
    </div>
  )
}

/**
 * The read view of a place ("Postcard"): Explore's hero, a reading column, and a sticky
 * rail with the plan and the practical details. Editing lives behind `onEdit`.
 */
export function PlaceView({
  place,
  onEdit,
  onPrefetchEdit,
  onPhotoAttached,
  handlesRef,
}: {
  place: PlaceWithRelations
  onEdit: () => void
  onPrefetchEdit?: () => void
  onPhotoAttached: () => void
  handlesRef?: React.MutableRefObject<PlaceViewHandles | null>
}) {
  const router = useRouter()
  const photos = React.useMemo(() => orderedPhotos(place.attachments), [place.attachments])
  const [lightbox, setLightbox] = React.useState<number | null>(null)

  const [statusOverride, setStatusOverride] = React.useState<VisitStatus | null>(null)
  const latestSelectionRef = React.useRef<VisitStatus | null>(null)
  const desiredStatusRef = React.useRef<VisitStatus | null>(null)
  const persistingRef = React.useRef(false)
  const statusGenerationRef = React.useRef(0)
  const persistPromiseRef = React.useRef<Promise<void> | null>(null)
  const displayPlace = statusOverride ? { ...place, visitStatus: statusOverride } : place

  const persistVisitStatus = async () => {
    try {
      while (desiredStatusRef.current !== null) {
        const target = desiredStatusRef.current
        desiredStatusRef.current = null
        const generation = statusGenerationRef.current
        try {
          const response = await fetch(`/api/places/${place.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visitStatus: target }),
          })
          if (!response.ok) {
            const data = await response.json().catch(() => null)
            throw new Error((data && typeof data.message === "string" && data.message) || "Couldn't update your plan")
          }
          if (generation === statusGenerationRef.current && desiredStatusRef.current === null && latestSelectionRef.current === target) {
            latestSelectionRef.current = null
            router.refresh()
          }
        } catch (error) {
          if (generation === statusGenerationRef.current && desiredStatusRef.current === null && latestSelectionRef.current === target) {
            latestSelectionRef.current = null
            setStatusOverride(null)
            router.refresh()
            notify.error(error instanceof Error ? error.message : "Couldn't update your plan")
          }
        }
      }
    } finally {
      persistingRef.current = false
      persistPromiseRef.current = null
    }
  }

  const flushStatus = React.useCallback(async () => {
    while (persistPromiseRef.current) {
      await persistPromiseRef.current
    }
  }, [])

  // Release the optimistic override once the server data confirms it, so the display never
  // flips back to the old status during the refresh round-trip. This only ever clears the
  // override; it never re-applies a selection.
  React.useEffect(() => {
    if (statusOverride && place.visitStatus === statusOverride) {
      setStatusOverride(null)
    }
  }, [place.visitStatus, statusOverride])

  React.useEffect(() => {
    if (handlesRef) {
      handlesRef.current = { flushStatus, displayPlace: () => displayPlace }
    }
  }, [handlesRef, flushStatus, displayPlace])

  const setVisitStatus = (next: VisitStatus) => {
    const displayed = (displayPlace.visitStatus as VisitStatus | null) ?? "not_visited"
    if (next === displayed) return
    latestSelectionRef.current = next
    desiredStatusRef.current = next
    statusGenerationRef.current += 1
    setStatusOverride(next)
    if (persistingRef.current) return
    persistingRef.current = true
    persistPromiseRef.current = persistVisitStatus()
    void persistPromiseRef.current
  }

  return (
    <SectionEditProvider place={place} onRefresh={() => router.refresh()}>
      <PlaceHero place={displayPlace} photos={photos} onEdit={onEdit} onPrefetchEdit={onPrefetchEdit} onOpenPhoto={setLightbox} onPhotoAttached={onPhotoAttached} />
      <QuickFacts place={displayPlace} />

      {/* On small screens the rail sits right after the note; from lg it is a sticky column. */}
      <div className="grid gap-10 px-4 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-12 lg:pt-2 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-10 empty:hidden lg:col-start-1 lg:row-start-1">
          <EditableSection id="why" read={<WhyItsHere place={place} />} />
          <MakeItYours place={place} hasPhotos={photos.length > 0} onEdit={onEdit} />
        </div>
        <aside className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Plan and practical details">
          <div className="space-y-4 lg:sticky lg:top-6">
            <EditableSection id="plan" read={<YourPlan place={displayPlace} onEdit={onEdit} onStatusChange={setVisitStatus} />} />
            <EditableSection id="ground" read={<OnTheGround place={place} onEdit={onEdit} />} />
          </div>
        </aside>
        <div className="min-w-0 space-y-12 lg:col-start-1 lg:row-start-2">
          <EditableSection id="about" read={<About place={place} />} />
          <EditableSection id="know" read={<GoodToKnow place={place} />} />
          <EditableSection id="photos" read={<Photos photos={photos} onOpen={setLightbox} />} />
          <EditableSection id="links" read={<Links place={place} />} />
          <Sources place={place} />
          <RecordInfo place={place} />
        </div>
      </div>

      {photos.length > 0 && (
        <PhotoLightbox photos={photos} open={lightbox !== null} index={lightbox ?? 0} onClose={() => setLightbox(null)} />
      )}
    </SectionEditProvider>
  )
}
