"use client"

import {
  ArrowUpRight, Armchair, Coins, FileText, Footprints, Globe, Hash, ImageIcon, Images, Info, Link2, Quote, Sunrise,
  UserRound, UtensilsCrossed, Youtube, type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { confidenceLabel, describeSource, formatSavedDate, linkLabel, safeExternalUrl } from "@/lib/place-view/format"
import { PhotoAttribution } from "@/components/attribution/photo-attribution"
import { PoweredByGoogle } from "@/components/attribution/powered-by-google"
import type { Attachment, PlaceWithRelations } from "@/types/database"

/** Explore's rail header: a primary eyebrow that says why, a title that says what. */
export function SectionHeader({ eyebrow, title, id }: { eyebrow: string; title?: string; id?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      {title && (
        <h2 id={id} className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h2>
      )}
    </div>
  )
}

const humanize = (v: string) => v.replace(/-/g, " ")

/** The owner's note, set as Explore's quote, with where the place came from underneath. */
export function WhyItsHere({ place }: { place: PlaceWithRelations }) {
  const firstSource = place.sources.find((s) => s.meta?.platform || s.meta?.author)
  const found = firstSource ? describeSource(firstSource) : null
  const saved = formatSavedDate(place.createdAt)
  if (!place.notes && !place.recommendedBy) return null

  return (
    <section aria-label="Why it's here">
      <SectionHeader eyebrow="Why it's here" />
      {place.notes && (
        <blockquote className="mt-3 whitespace-pre-line border-l-2 border-primary/40 pl-5 font-editorial text-[22px] italic leading-snug text-foreground/90 sm:text-[28px]">
          {place.notes}
        </blockquote>
      )}
      <p className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", place.notes ? "mt-4 pl-5" : "mt-2")}>
        {place.recommendedBy && (
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" aria-hidden />
            Tip from <b className="font-semibold text-foreground">{place.recommendedBy}</b>
          </span>
        )}
        {found && (
          <span className="inline-flex items-center gap-1">
            <Quote className="h-3.5 w-3.5" aria-hidden />
            Found via {found.title}
            {firstSource?.meta?.author ? ` · ${firstSource.meta.author}` : ""}
          </span>
        )}
        {saved && <span>Saved {saved}</span>}
      </p>
    </section>
  )
}

export function About({ place }: { place: PlaceWithRelations }) {
  const altNames = (place.altNames ?? []).filter(Boolean)
  if (!place.description && altNames.length === 0) return null
  return (
    <section aria-labelledby="place-about">
      <SectionHeader eyebrow="About" title="The place" id="place-about" />
      {place.description && (
        <p className="mt-3 max-w-2xl whitespace-pre-line text-[15px] leading-7 text-foreground/85 sm:text-[17px] sm:leading-8">{place.description}</p>
      )}
      {altNames.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Also known as {altNames.join(" · ")}</p>}
    </section>
  )
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-3 rounded-2xl bg-secondary/60 p-4">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}

export function GoodToKnow({ place }: { place: PlaceWithRelations }) {
  const list = (v: string[] | null | undefined) => (v ?? []).filter(Boolean).map(humanize)
  const facts: Array<[LucideIcon, string, string]> = []
  if (place.best_time) facts.push([Sunrise, "Best time", place.best_time])
  if (place.price_level) facts.push([Coins, "Price", place.price_level])
  if (list(place.activities).length) facts.push([Footprints, "Things to do", list(place.activities).join(", ")])
  if (list(place.cuisine).length) facts.push([UtensilsCrossed, "Food & drink", list(place.cuisine).join(", ")])
  if (list(place.amenities).length) facts.push([Armchair, "Amenities", list(place.amenities).join(", ")])
  if ((place.tags ?? []).length) facts.push([Hash, "Tags", (place.tags ?? []).map((t) => `#${t}`).join(" ")])
  if (facts.length === 0 && !place.practicalInfo) return null

  return (
    <section aria-labelledby="place-good-to-know">
      <SectionHeader eyebrow="Good to know" title="Before you go" id="place-good-to-know" />
      {facts.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {facts.map(([icon, label, value]) => (
            <Fact key={label} icon={icon} label={label} value={value} />
          ))}
        </div>
      )}
      {place.practicalInfo && (
        <div className="mt-3 rounded-2xl border p-4 text-sm leading-6 text-foreground/85">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Practical info</p>
          <p className="whitespace-pre-line">{place.practicalInfo}</p>
        </div>
      )}
    </section>
  )
}

export function Photos({ photos, onOpen }: { photos: Attachment[]; onOpen: (index: number) => void }) {
  if (photos.length === 0) return null
  const shown = photos.slice(0, 4)
  const credits = new Map<string, Attachment>()
  for (const p of photos) if (p.attribution) credits.set(JSON.stringify(p.attribution), p)

  const tile = (photo: Attachment, index: number, className: string) => (
    <button
      key={photo.id}
      type="button"
      onClick={() => onOpen(index)}
      aria-label={`Open photo ${index + 1} of ${photos.length}`}
      className={cn("group relative overflow-hidden bg-muted", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={index === 0 ? photo.uri : photo.thumbnailUri || photo.uri}
        alt={photo.caption || ""}
        loading="lazy"
        className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
      />
    </button>
  )

  return (
    <section aria-labelledby="place-photos">
      <SectionHeader eyebrow="Photos" title={photos.length === 1 ? "1 photo" : `${photos.length} photos`} id="place-photos" />
      <div
        className={cn(
          "relative mt-4 grid gap-2 overflow-hidden rounded-3xl",
          shown.length === 1 && "h-64 grid-cols-1 sm:h-80",
          shown.length === 2 && "h-56 grid-cols-2 sm:h-80",
          shown.length >= 3 && "h-56 grid-cols-3 grid-rows-2 sm:h-80 sm:grid-cols-4"
        )}
      >
        {shown.map((photo, i) =>
          tile(
            photo,
            i,
            shown.length >= 3
              ? i === 0
                ? "col-span-2 row-span-2"
                : i === 3
                  ? "hidden sm:col-span-2 sm:block"
                  : shown.length === 3
                    ? "sm:col-span-2"
                    : ""
              : ""
          )
        )}
        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => onOpen(0)}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-black shadow-sm transition hover:bg-white"
          >
            <Images className="h-3.5 w-3.5" aria-hidden /> View all
          </button>
        )}
      </div>
      {(credits.size > 0 || photos.some((p) => p.source === "google_places")) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4">
          {[...credits.values()].map((p) => (
            <PhotoAttribution key={p.id} attribution={p.attribution} className="!mt-0 max-w-full" />
          ))}
          {photos.some((p) => p.source === "google_places") && <PoweredByGoogle className="ml-auto" />}
        </div>
      )}
    </section>
  )
}

function linkIcon(url: string): LucideIcon {
  if (/youtube\.com|youtu\.be/.test(url)) return Youtube
  return Globe
}

export function Links({ place }: { place: PlaceWithRelations }) {
  if (place.links.length === 0) return null
  return (
    <section aria-labelledby="place-links">
      <SectionHeader eyebrow="Links & reading" title="Saved for later" id="place-links" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {place.links.map((link) => {
          const { title, domain } = linkLabel(link)
          const Icon = linkIcon(link.url)
          const href = safeExternalUrl(link.url)
          const Card = href ? "a" : "div"
          return (
            <Card
              key={link.id}
              {...(href ? { href, target: "_blank", rel: "noopener noreferrer" } : {})}
              className="flex min-w-0 flex-col justify-between gap-6 rounded-2xl border p-4 transition hover:bg-secondary/50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 block break-words text-sm font-semibold leading-snug">{title}</span>
                {domain && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="truncate">{domain}</span>
                    <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
                  </span>
                )}
              </span>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

export function Sources({ place }: { place: PlaceWithRelations }) {
  if (place.sources.length === 0) return null
  return (
    <section aria-labelledby="place-sources">
      <SectionHeader eyebrow="Where you found it" title="Sources" id="place-sources" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {place.sources.map((source) => {
          const { title, detail, url } = describeSource(source)
          const Icon = source.type === "screenshot" ? ImageIcon : source.type === "url" ? Link2 : FileText
          return (
            <div key={source.id} className="flex min-w-0 gap-3 rounded-2xl border p-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-medium">{title}</p>
                {detail.length > 0 && <p className="break-words text-xs text-muted-foreground">{detail.join(" · ")}</p>}
                {url && safeExternalUrl(url) && (
                  <a href={safeExternalUrl(url)!} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-primary hover:underline">
                    {url}
                  </a>
                )}
                {source.ocrText && (
                  <p className="mt-2 line-clamp-2 font-editorial text-base italic leading-snug text-foreground/80">“{source.ocrText.trim()}”</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const TONES = {
  high: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  medium: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  low: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "very-low": "bg-muted text-muted-foreground",
  unknown: "bg-muted text-muted-foreground",
} as const

function formatTimestamp(iso: string | null | undefined) {
  if (!iso) return "N/A"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

/** Bookkeeping the owner rarely needs: kept, but folded away at the bottom. */
export function RecordInfo({ place }: { place: PlaceWithRelations }) {
  const confidence = confidenceLabel(place.confidence)
  const storedPaths = place.sources.filter((s) => s.uri && s.type === "screenshot").map((s) => s.uri as string)
  return (
    <details className="group rounded-2xl border px-4 py-3 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
        <Info className="h-3.5 w-3.5" aria-hidden />
        Record info
        <span className="ml-auto transition group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div><dt className="inline">Created · </dt><dd className="inline" suppressHydrationWarning>{formatTimestamp(place.createdAt)}</dd></div>
        <div><dt className="inline">Last updated · </dt><dd className="inline" suppressHydrationWarning>{formatTimestamp(place.updatedAt)}</dd></div>
        <div>
          <dt className="inline">Confidence · </dt>
          <dd className="inline"><span className={cn("rounded-full px-2 py-0.5 font-semibold", TONES[confidence.tone])}>{confidence.label}</span></dd>
        </div>
        <div><dt className="inline">Status · </dt><dd className="inline capitalize">{place.status}</dd></div>
        <div className="sm:col-span-2"><dt className="inline">Place ID · </dt><dd className="inline break-all font-mono">{place.id}</dd></div>
        {storedPaths.map((path) => (
          <div key={path} className="sm:col-span-2"><dt className="inline">Source file · </dt><dd className="inline break-all font-mono">{path}</dd></div>
        ))}
      </dl>
    </details>
  )
}
