"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { CalendarHeart, Coins, ImagePlus, MapPin, PenLine, Plus, Quote, Sunrise, type LucideIcon } from "lucide-react"
import { coverPhoto } from "@/lib/cover-photo"
import { formatDateOnly } from "@/lib/place-view/format"
import { notify } from "@/lib/notify"
import type { Attachment, PlaceWithRelations } from "@/types/database"
import type { ExploreCollection, ExplorePlace } from "@/lib/explore/types"
import { PlaceHero } from "./place-hero"
import { About, GoodToKnow, Links, Photos, RecordInfo, SectionHeader, Sources, WhyItsHere } from "./place-sections"
import { OnTheGround, YourPlan } from "./place-rail"
import { AlsoInCity } from "./also-in-city"
import { MobileActionBar } from "./mobile-action-bar"
import { applyDraft, SectionEditProvider, useSectionEdit, type SectionEditHandles, type SectionId } from "./section-edit"
import { EditIndex, SectionSlot, sectionShown } from "./postcard-edit"

const PhotoLightbox = dynamic(
  () => import("@/components/ui-custom/photo-lightbox").then((mod) => ({ default: mod.PhotoLightbox })),
  { ssr: false }
)

type VisitStatus = "not_visited" | "planned" | "visited"

/** Imperative access for the page shell: drain a pending status write, read what's shown. */
export interface PlaceViewHandles {
  /** Resolves once no one-tap visit-status write is in flight or queued. */
  flushStatus: () => Promise<void>
  /** True once in-flight section edits are saved. False when a save failed or the section editor is not mounted. */
  flushSections: () => Promise<boolean>
  /** The place as currently displayed, including a confirmed status override and section edits. */
  displayPlace: () => PlaceWithRelations
}

/** Cover first, then the rest in their stored order. */
export function orderedPhotos(attachments: Attachment[]): Attachment[] {
  const photos = attachments.filter((a) => a.type === "photo")
  const cover = coverPhoto(attachments)
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
  const sections = useSectionEdit()
  const missing: Array<[LucideIcon, string, string, SectionId]> = []
  if (!place.notes) missing.push([Quote, "Why did you save it?", "Your note becomes the quote at the top", "why"])
  if (!hasPhotos) missing.push([ImagePlus, "Add a photo", "Upload one or find one for this place", "photos"])
  if (!place.address && !place.hours) missing.push([MapPin, "Address & hours", "So it's useful when you're there", "ground"])
  if (!place.description) missing.push([PenLine, "Describe it", "A line or two about the place", "about"])
  if (missing.length < 2) return null

  return (
    <section aria-labelledby="place-make-it-yours">
      <SectionHeader eyebrow="Make it yours" title="Only the basics so far" id="place-make-it-yours" />
      <p className="mt-1 text-sm text-muted-foreground">Add what you remember. Each one fills in a part of this page.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {missing.map(([icon, title, detail, section]) => (
          <Invitation key={title} icon={icon} title={title} detail={detail} onClick={sections ? () => sections.open(section) : onEdit} />
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

function PlaceColumns({
  place,
  displayPlace,
  photos,
  trips,
  onEdit,
  onStatusChange,
  onTripsChanged,
  onOpenPhoto,
  blockWrites = false,
}: {
  place: PlaceWithRelations
  displayPlace: PlaceWithRelations
  photos: Attachment[]
  trips: ExploreCollection[]
  onEdit: () => void
  onStatusChange: (next: VisitStatus) => void
  onTripsChanged: () => void
  onOpenPhoto: (index: number) => void
  blockWrites?: boolean
}) {
  const api = useSectionEdit()
  const editing = Boolean(api?.editingAll)
  const shownPlace = editing && api ? applyDraft(displayPlace, api.draft) : displayPlace

  if (editing && api?.mobile) {
    return (
      <>
        <EditIndex place={shownPlace} />
        <div className="mt-10 space-y-12 px-4 sm:px-8">
          <Sources place={place} />
          <RecordInfo place={place} />
        </div>
      </>
    )
  }

  return (
    // On small screens the rail sits right after the note; from lg it is a sticky column.
    <div className="grid gap-10 px-4 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-12 lg:pt-2 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-10 empty:hidden lg:col-start-1 lg:row-start-1">
        <SectionSlot id="why" shown={sectionShown("why", shownPlace)}>
          <WhyItsHere place={shownPlace} />
        </SectionSlot>
        {!editing && <MakeItYours place={place} hasPhotos={photos.length > 0} onEdit={onEdit} />}
      </div>
      <aside className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Plan and practical details">
        <div className="space-y-4 lg:sticky lg:top-6">
          <SectionSlot id="plan" shown>
            <YourPlan place={shownPlace} onEdit={onEdit} onStatusChange={onStatusChange} trips={trips} onTripsChanged={onTripsChanged} blockWrites={blockWrites} />
          </SectionSlot>
          <SectionSlot id="ground" shown>
            <OnTheGround place={shownPlace} onEdit={onEdit} />
          </SectionSlot>
        </div>
      </aside>
      <div className="min-w-0 space-y-12 lg:col-start-1 lg:row-start-2">
        <SectionSlot id="about" shown={sectionShown("about", shownPlace)}>
          <About place={shownPlace} />
        </SectionSlot>
        <SectionSlot id="know" shown={sectionShown("know", shownPlace)}>
          <GoodToKnow place={shownPlace} />
        </SectionSlot>
        <SectionSlot id="photos" shown={sectionShown("photos", shownPlace)}>
          <Photos photos={photos} onOpen={onOpenPhoto} />
        </SectionSlot>
        <SectionSlot id="links" shown={sectionShown("links", shownPlace)}>
          <Links place={shownPlace} />
        </SectionSlot>
        <Sources place={place} />
        <RecordInfo place={place} />
      </div>
    </div>
  )
}

/**
 * The read view of a place ("Postcard"): Explore's hero, a reading column, and a sticky
 * rail with the plan and the practical details. Section pencils edit one part in place.
 * Global Edit turns this same page into Postcard edit mode (`editing`).
 */
export function PlaceView({
  place,
  editing = false,
  onEdit,
  onDoneEditing,
  onOpenClassic,
  onPrefetchEdit,
  onPhotoAttached,
  onArchive,
  onDeleted,
  onRestored,
  blockRestore = false,
  blockWrites = false,
  handlesRef,
  trips,
  alsoIn,
  showMobileActionBar = true,
  softCover = false,
  fitReviewBar = false,
  lead,
}: {
  place: PlaceWithRelations
  editing?: boolean
  onEdit: () => void
  onDoneEditing?: () => void
  onOpenClassic?: () => void
  onPrefetchEdit?: () => void
  onPhotoAttached: () => void
  onArchive?: () => void
  onDeleted?: () => void
  onRestored?: () => void
  blockRestore?: boolean
  blockWrites?: boolean
  handlesRef?: React.MutableRefObject<PlaceViewHandles | null>
  trips: ExploreCollection[]
  alsoIn: ExplorePlace[]
  showMobileActionBar?: boolean
  /** Blur a shared-screenshot cover and offer Find a photo. Review sets this. */
  softCover?: boolean
  /** On a phone, keep the hero title above Review's fixed action bar. */
  fitReviewBar?: boolean
  /** Review-only content under the hero, such as the possible-duplicate note. */
  lead?: React.ReactNode
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
  const displayPlace = React.useMemo(
    () => (statusOverride ? { ...place, visitStatus: statusOverride } : place),
    [place, statusOverride]
  )
  const sectionHandlesRef = React.useRef<SectionEditHandles | null>(null)

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
      handlesRef.current = {
        flushStatus,
        flushSections: () => sectionHandlesRef.current?.flush() ?? Promise.resolve(false),
        displayPlace: () => sectionHandlesRef.current?.withDraft(displayPlace) ?? displayPlace,
      }
    }
  }, [handlesRef, flushStatus, displayPlace])

  const setVisitStatus = (next: VisitStatus) => {
    if (blockWrites) return
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

  const editPlace = blockWrites ? () => {} : onEdit
  const attachPhoto = blockWrites ? () => {} : onPhotoAttached

  return (
    <SectionEditProvider place={place} onRefresh={() => router.refresh()} handlesRef={sectionHandlesRef} editingAll={blockWrites ? false : editing} onExitEditing={onDoneEditing} blockWrites={blockWrites}>
      <PlaceHero place={displayPlace} photos={photos} softCover={softCover} fitReviewBar={fitReviewBar} onEdit={editPlace} onOpenClassic={blockWrites ? undefined : onOpenClassic} onPrefetchEdit={onPrefetchEdit} onOpenPhoto={setLightbox} onPhotoAttached={attachPhoto} onArchive={onArchive} onDeleted={onDeleted} onRestored={onRestored} blockRestore={blockRestore} blockWrites={blockWrites} />
      {lead}
      <QuickFacts place={displayPlace} />
      <PlaceColumns
        place={place}
        displayPlace={displayPlace}
        photos={photos}
        trips={trips}
        onEdit={editPlace}
        onStatusChange={setVisitStatus}
        onTripsChanged={() => router.refresh()}
        onOpenPhoto={setLightbox}
        blockWrites={blockWrites}
      />

      {place.city && <AlsoInCity city={place.city} places={alsoIn} />}

      {showMobileActionBar && <MobileActionBar place={place} trips={trips} onChanged={() => router.refresh()} blockWrites={blockWrites} />}

      {photos.length > 0 && (
        <PhotoLightbox photos={photos} open={lightbox !== null} index={lightbox ?? 0} onClose={() => setLightbox(null)} />
      )}
    </SectionEditProvider>
  )
}
