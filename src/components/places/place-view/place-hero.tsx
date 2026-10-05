"use client"

import Link from "next/link"
import { Archive, ArrowLeft, CalendarHeart, Check, Images, Inbox, MapPin, Pencil, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { flagFor, slugify } from "@/lib/explore/geo"
import { formatDateOnly } from "@/lib/place-view/format"
import { FallbackArt } from "@/components/explore/fallback-art"
import { kindLabel } from "@/components/explore/kind-icon"
import { FindImageButton } from "@/components/places/find-image-button"
import { PhotoAttribution } from "@/components/attribution/photo-attribution"
import { PoweredByGoogle } from "@/components/attribution/powered-by-google"
import type { Attachment, PlaceWithRelations } from "@/types/database"
import { PlaceActionsMenu } from "./place-actions-menu"

const GLASS = "border border-white/20 bg-black/35 text-white backdrop-blur-md transition hover:bg-black/50"

/**
 * Explore's billboard, for one place: the photo runs full-bleed and fades into the page,
 * with the name in the editorial serif over a left scrim (see explore-hero.tsx).
 */
export function PlaceHero({
  place,
  photos,
  onEdit,
  onPrefetchEdit,
  onOpenPhoto,
  onPhotoAttached,
}: {
  place: PlaceWithRelations
  photos: Attachment[]
  onEdit: () => void
  onPrefetchEdit?: () => void
  onOpenPhoto: (index: number) => void
  onPhotoAttached: () => void
}) {
  const cover = photos[0]
  const flag = flagFor(place.country)
  const countrySlug = place.country ? slugify(place.country) : null
  const vibes = (place.vibes ?? []).slice(0, 3)
  const planned = place.visitStatus === "planned" ? formatDateOnly(place.plannedVisit, { weekday: false, year: false }) : null
  const priority = place.priority ?? 0

  return (
    <section aria-label={place.name} className="relative isolate overflow-hidden bg-black">
      <div className="absolute inset-0">
        {cover ? (
          // Plain <img>: photos are user content on Blob URLs, matching Explore.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.uri} alt="" fetchPriority="high" className="h-full w-full object-cover opacity-90 animate-in fade-in zoom-in-[1.03] duration-700" />
        ) : (
          <FallbackArt name={place.name} kind={place.kind} />
        )}
      </div>
      {/* Readability scrims: left for the copy, top for the controls, bottom to melt into the page. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/60 to-transparent sm:h-40" />

      <div className={cn("relative flex flex-col justify-between gap-10 px-4 pb-10 pt-4 sm:px-8 sm:pb-16 sm:pt-6", cover ? "min-h-[min(72vh,38rem)]" : "min-h-[26rem]")}>
        <div className="flex items-center gap-2">
          <Link href="/library" className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium", GLASS)}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span>Library</span>
          </Link>
          <span className="ml-auto" />
          {!cover && (
            <FindImageButton
              placeId={place.id}
              placeName={place.name}
              placeCity={place.city}
              hasGooglePlaceId={Boolean(place.googlePlaceId)}
              onAttached={onPhotoAttached}
              buttonVariant="ghost"
              className={cn("h-9 rounded-full px-3.5", GLASS, "hover:text-white")}
            />
          )}
          <button
            type="button"
            onClick={onEdit}
            onPointerEnter={onPrefetchEdit}
            onFocus={onPrefetchEdit}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium", GLASS)}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </button>
          <PlaceActionsMenu placeId={place.id} placeName={place.name} status={place.status} className={GLASS} />
        </div>

        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-0 max-w-4xl flex-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md">
                {kindLabel(place.kind)}
              </span>
              {place.status === "inbox" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-300/95 px-2.5 py-1 text-[11px] font-semibold text-black">
                  <Inbox className="h-3 w-3" aria-hidden /> In your inbox
                </span>
              )}
              {place.status === "archived" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-black">
                  <Archive className="h-3 w-3" aria-hidden /> Archived
                </span>
              )}
              {place.visitStatus === "planned" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-black">
                  <CalendarHeart className="h-3 w-3" aria-hidden /> {planned ? `Planned · ${planned}` : "Planned"}
                </span>
              )}
              {place.visitStatus === "visited" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-black">
                  <Check className="h-3 w-3" aria-hidden /> Been there
                </span>
              )}
              {priority >= 5 && place.visitStatus !== "visited" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                  <Sparkles className="h-3 w-3" aria-hidden /> Bucket list
                </span>
              )}
            </div>
            <h1 className="mt-3 break-words font-editorial text-5xl leading-[0.95] tracking-tight text-white drop-shadow-sm [text-wrap:balance] sm:text-7xl lg:text-8xl">
              {place.name}
            </h1>
            {(place.city || place.admin || place.country) && (
              <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-sm font-medium text-white/90 sm:text-base">
                {flag ? <span aria-hidden>{flag}</span> : <MapPin className="h-4 w-4" aria-hidden />}
                {place.city &&
                  (countrySlug ? (
                    <Link href={`/explore/atlas/${countrySlug}/${slugify(place.city)}`} className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
                      {place.city}
                    </Link>
                  ) : (
                    <span>{place.city}</span>
                  ))}
                {place.admin && place.admin !== place.city && (
                  <>
                    {place.city && <span className="text-white/50" aria-hidden>·</span>}
                    <span>{place.admin}</span>
                  </>
                )}
                {place.country && countrySlug && (
                  <>
                    {(place.city || place.admin) && <span className="text-white/50" aria-hidden>·</span>}
                    <Link href={`/explore/atlas/${countrySlug}`} className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
                      {place.country}
                    </Link>
                  </>
                )}
              </p>
            )}
            {vibes.length > 0 && (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-white/65">
                {vibes.map((v) => v.replace(/-/g, " ")).join(" • ")}
              </p>
            )}
          </div>

          {photos.length > 1 && (
            <div className="flex items-end gap-2">
              <div className="hidden items-end gap-2 md:flex">
                {photos.slice(1, 4).map((photo, i) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => onOpenPhoto(i + 1)}
                    aria-label={`Open photo ${i + 2}`}
                    className="overflow-hidden rounded-xl ring-2 ring-white/70 transition hover:ring-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.thumbnailUri || photo.uri} alt="" loading="lazy" className="h-16 w-20 object-cover" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onOpenPhoto(0)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/90 px-3.5 text-sm font-medium text-black transition hover:bg-white"
              >
                <Images className="h-4 w-4" aria-hidden />
                {photos.length} photos
              </button>
            </div>
          )}
        </div>
      </div>

      {cover && (
        <div className="absolute bottom-1 right-4 z-10 flex max-w-[60%] items-center gap-2 sm:right-8">
          <PhotoAttribution attribution={cover.attribution} className="!mt-0 !text-foreground/60" />
          {cover.source === "google_places" && (
            <span className="rounded bg-white/85 px-1.5 py-0.5">
              <PoweredByGoogle />
            </span>
          )}
        </div>
      )}
    </section>
  )
}
