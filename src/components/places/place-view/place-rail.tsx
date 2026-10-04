"use client"

import * as React from "react"
import { CalendarCheck, CalendarHeart, Check, ChevronDown, Clock, Copy, ExternalLink, Globe, Mail, MapPin, Navigation, Pencil, Phone, Sparkles, Star, Ticket, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { displayUrl, formatDateOnly, formatTime, safeExternalUrl, summarizeHours } from "@/lib/place-view/format"
import type { PlaceWithRelations, Reservation } from "@/types/database"

type VisitStatus = "not_visited" | "planned" | "visited"

const VISIT_STATUS_OPTIONS: Array<{ value: VisitStatus; label: string }> = [
  { value: "not_visited", label: "Want to go" },
  { value: "planned", label: "Planned" },
  { value: "visited", label: "Been" },
]

function VisitStatusControl({ value, onChange }: { value: VisitStatus; onChange: (next: VisitStatus) => void }) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])
  return (
    <div role="radiogroup" aria-label="Visit status" className="mt-3 inline-flex w-full rounded-full bg-secondary p-1">
      {VISIT_STATUS_OPTIONS.map((option, i) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            ref={(el) => {
              refs.current[i] = el
            }}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
              event.preventDefault()
              const next = (i + (event.key === "ArrowRight" ? 1 : -1) + VISIT_STATUS_OPTIONS.length) % VISIT_STATUS_OPTIONS.length
              refs.current[next]?.focus()
              onChange(VISIT_STATUS_OPTIONS[next].value)
            }}
            className={cn(
              "inline-flex flex-1 items-center justify-center rounded-full px-2 py-1 text-xs font-semibold transition",
              selected ? "bg-background text-foreground shadow" : "text-secondary-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const CARD = "rounded-3xl border bg-card p-5 text-card-foreground shadow-sm"
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.2em] text-primary"

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${label}: ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-3.5 w-3.5", i <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} aria-hidden />
      ))}
    </span>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => undefined)
      }}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
    </button>
  )
}

const RES_STATUS_TONE: Record<string, string> = {
  confirmed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  cancelled: "bg-muted text-muted-foreground line-through",
  completed: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
}

/** A booking, shown like a ticket stub: every stored field, the confirmation copyable. */
export function ReservationTicket({ reservation }: { reservation: Reservation }) {
  const r = reservation
  const when = [formatDateOnly(r.reservationDate), formatTime(r.reservationTime)].filter(Boolean).join(" · ")
  const sub = [r.bookingPlatform, r.partySize ? `${r.partySize} ${r.partySize === 1 ? "person" : "people"}` : null, r.totalCost].filter(Boolean)
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-background" data-testid="reservation-ticket">
      <div className="flex items-start gap-3 px-4 pt-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Ticket className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{when}</p>
          {sub.length > 0 && <p className="text-xs text-muted-foreground">{sub.join(" · ")}</p>}
        </div>
        {r.status && (
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", RES_STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground")}>
            {r.status}
          </span>
        )}
      </div>
      <div className="relative my-3 border-t border-dashed" aria-hidden>
        <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border bg-card" />
        <span className="absolute -right-2 -top-2 h-4 w-4 rounded-full border bg-card" />
      </div>
      <div className="space-y-2 px-4 pb-4 text-xs">
        {r.confirmationNumber && (
          <p className="flex items-center gap-2">
            <span className="text-muted-foreground">Confirmation</span>
            <span className="break-all font-mono font-semibold tracking-wider">{r.confirmationNumber}</span>
            <CopyButton value={r.confirmationNumber} label="Copy confirmation number" />
          </p>
        )}
        {r.specialRequests && (
          <p><span className="text-muted-foreground">Requests · </span>{r.specialRequests}</p>
        )}
        {r.notes && <p className="leading-5 text-muted-foreground">{r.notes}</p>}
        {safeExternalUrl(r.bookingUrl) && (
          <a href={safeExternalUrl(r.bookingUrl)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Open booking <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
    </div>
  )
}

export function YourPlan({
  place,
  onEdit,
  onStatusChange,
}: {
  place: PlaceWithRelations
  onEdit: () => void
  onStatusChange: (next: VisitStatus) => void
}) {
  const status: VisitStatus = (place.visitStatus as VisitStatus) || "not_visited"
  const planned = formatDateOnly(place.plannedVisit)
  const lastVisited = formatDateOnly(place.lastVisited)
  const companions = (place.companions ?? []).filter(Boolean)
  const priority = place.priority ?? 0
  const rating = place.ratingSelf ?? 0
  const hasDetails = Boolean(planned || lastVisited || companions.length || priority || rating || place.reservations.length)

  return (
    <section aria-labelledby="place-plan" className={CARD}>
      <h2 id="place-plan" className={EYEBROW}>Your plan</h2>
      <VisitStatusControl value={status} onChange={onStatusChange} />
      <dl className="mt-4 space-y-3 text-sm">
        {planned && (
          <div className="flex items-center gap-3">
            <CalendarHeart className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <dt className="sr-only">Planned visit</dt>
            <dd><span className="text-muted-foreground">Planned for </span><span className="font-medium">{planned}</span></dd>
          </div>
        )}
        {lastVisited && (
          <div className="flex items-center gap-3">
            <CalendarCheck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <dt className="sr-only">Last visited</dt>
            <dd><span className="text-muted-foreground">Last visited </span><span className="font-medium">{lastVisited}</span></dd>
          </div>
        )}
        {companions.length > 0 && (
          <div className="flex items-center gap-3">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <dt className="sr-only">Companions</dt>
            <dd>With {companions.length === 1 ? companions[0] : `${companions.slice(0, -1).join(", ")} & ${companions[companions.length - 1]}`}</dd>
          </div>
        )}
        {priority > 0 && (
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <dt className="flex-1">{priority >= 5 ? "Bucket list" : "Priority"}</dt>
            <dd><Stars value={priority} label="Priority" /></dd>
          </div>
        )}
        {rating > 0 && (
          <div className="flex items-center gap-3">
            <Star className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <dt className="flex-1">Your rating</dt>
            <dd><Stars value={rating} label="Your rating" /></dd>
          </div>
        )}
      </dl>
      {place.reservations.length > 0 && (
        <div className="mt-4 space-y-3">
          {place.reservations.map((r) => (
            <ReservationTicket key={r.id} reservation={r} />
          ))}
        </div>
      )}
      {!hasDetails && (
        <button type="button" onClick={onEdit} className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Add a date, companions or a booking
        </button>
      )}
    </section>
  )
}

export function OnTheGround({ place, onEdit }: { place: PlaceWithRelations; onEdit: () => void }) {
  const hours = summarizeHours(place.hours)
  const coords = place.coords && Number.isFinite(place.coords.lat) && Number.isFinite(place.coords.lon) ? place.coords : null
  const hasAny = Boolean(hours || place.address || coords || place.website || place.phone || place.email)

  return (
    <section aria-labelledby="place-ground" className={CARD}>
      <h2 id="place-ground" className={EYEBROW}>On the ground</h2>
      {!hasAny ? (
        <div className="mt-2 space-y-3 text-sm text-muted-foreground">
          <p>No address, hours or contact yet.</p>
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Add address & hours
          </button>
        </div>
      ) : (
        <dl className="mt-4 space-y-3 text-sm">
          {hours && (
            <div className="flex gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Hours</dt>
              <dd className="min-w-0 flex-1">
                {hours.days.length > 1 && hours.summary.includes("·") ? (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-1 [&::-webkit-details-marker]:hidden">
                      <span>{hours.summary}</span>
                      <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-open:rotate-180" aria-hidden />
                    </summary>
                    <table className="mt-2 text-xs">
                      <tbody>
                        {hours.days.map((d) => (
                          <tr key={d.day}>
                            <th scope="row" className="pr-4 text-left font-medium text-muted-foreground">{d.label}</th>
                            <td>{d.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ) : (
                  <span>{hours.summary}</span>
                )}
              </dd>
            </div>
          )}
          {place.address && (
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Address</dt>
              <dd className="flex min-w-0 flex-1 items-start gap-1">
                <span className="min-w-0 whitespace-pre-line break-words">{place.address}</span>
                <CopyButton value={place.address} label="Copy address" />
              </dd>
            </div>
          )}
          {coords && (
            <div className="flex gap-3">
              <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Coordinates</dt>
              <dd className="font-mono text-xs text-muted-foreground">{coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}</dd>
            </div>
          )}
          {place.website && (
            <div className="flex gap-3">
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Website</dt>
              <dd className="min-w-0">
                {safeExternalUrl(place.website) ? (
                  <a href={safeExternalUrl(place.website)!} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">{displayUrl(place.website)}</a>
                ) : (
                  <span className="break-all">{place.website}</span>
                )}
              </dd>
            </div>
          )}
          {place.phone && (
            <div className="flex gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Phone</dt>
              <dd><a href={`tel:${place.phone.replace(/[^+\d]/g, "")}`} className="hover:underline">{place.phone}</a></dd>
            </div>
          )}
          {place.email && (
            <div className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Email</dt>
              <dd className="min-w-0"><a href={`mailto:${place.email}`} className="break-all hover:underline">{place.email}</a></dd>
            </div>
          )}
        </dl>
      )}
    </section>
  )
}
