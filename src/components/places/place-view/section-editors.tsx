"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { ExternalLink, Pencil, Plus, Star, Ticket, Trash2, Upload, X } from "lucide-react"
import { HoursEditor } from "@/components/ui-custom/hours-editor"
import { FindImageButton } from "@/components/places/find-image-button"

const PhotoUploader = dynamic(() => import("@/components/upload/photo-uploader").then((mod) => mod.PhotoUploader), { ssr: false })
import { cn } from "@/lib/utils"
import type { Reservation } from "@/types/database"
import { SECTION_LABELS, type SectionEditApi, type SectionId } from "./section-edit"

const LABEL = "text-xs font-medium text-muted-foreground"
const INPUT = "mt-1 flex h-10 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const AREA = "mt-1 min-h-[84px] w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"

function Field({
  label,
  value,
  onChange,
  area,
  type = "text",
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  area?: boolean
  type?: string
  placeholder?: string
}) {
  const id = React.useId()
  return (
    <label htmlFor={id} className="block min-w-0">
      <span className={LABEL}>{label}</span>
      {area ? (
        <textarea id={id} value={value} placeholder={placeholder} rows={4} onChange={(event) => onChange(event.target.value)} className={AREA} />
      ) : (
        <input id={id} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={INPUT} />
      )}
    </label>
  )
}

function TagField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
}) {
  const [draft, setDraft] = React.useState("")
  const add = () => {
    const next = draft.trim()
    if (!next) return
    if (!value.some((tag) => tag.toLowerCase() === next.toLowerCase())) onChange([...value, next])
    setDraft("")
  }
  return (
    <div>
      <span className={LABEL}>{label}</span>
      <div className="mt-1 flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-background px-2.5 py-1.5">
        {value.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((item) => item !== tag))}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium"
          >
            {tag}
            <X className="h-3 w-3 opacity-60" aria-hidden />
          </button>
        ))}
        <input
          value={draft}
          placeholder={placeholder}
          aria-label={label}
          className="min-w-[8rem] flex-1 bg-transparent px-1 text-xs outline-none"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault()
              add()
            }
          }}
          onBlur={add}
        />
      </div>
    </div>
  )
}

function StarPicker({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={LABEL}>{label}</span>
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${label} ${star} of 5`}
            aria-pressed={value === star}
            onClick={() => onChange(value === star ? 0 : star)}
            className="p-0.5"
          >
            <Star className={cn("h-5 w-5", star <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} aria-hidden />
          </button>
        ))}
      </span>
    </div>
  )
}

function EditorTitle({ id }: { id: SectionId }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{SECTION_LABELS[id]}</p>
}

function emptyReservation() {
  return {
    reservationDate: "",
    reservationTime: "",
    confirmationNumber: "",
    bookingPlatform: "",
    status: "confirmed",
    notes: "",
    partySize: "",
    totalCost: "",
    bookingUrl: "",
    specialRequests: "",
  }
}

function ReservationFields({
  value,
  onChange,
}: {
  value: ReturnType<typeof emptyReservation>
  onChange: (next: ReturnType<typeof emptyReservation>) => void
}) {
  const set = (key: keyof ReturnType<typeof emptyReservation>) => (next: string) => onChange({ ...value, [key]: next })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" type="date" value={value.reservationDate} onChange={set("reservationDate")} />
        <Field label="Time" type="time" value={value.reservationTime} onChange={set("reservationTime")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Platform" value={value.bookingPlatform} onChange={set("bookingPlatform")} placeholder="GetYourGuide" />
        <Field label="Confirmation" value={value.confirmationNumber} onChange={set("confirmationNumber")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Party size" type="number" value={value.partySize} onChange={set("partySize")} />
        <Field label="Cost" value={value.totalCost} onChange={set("totalCost")} placeholder="¥18,000" />
      </div>
      <label className="block">
        <span className={LABEL}>Status</span>
        <select value={value.status} aria-label="Reservation status" onChange={(event) => set("status")(event.target.value)} className={INPUT}>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <Field label="Booking URL" value={value.bookingUrl} onChange={set("bookingUrl")} placeholder="https://" />
      <Field label="Special requests" value={value.specialRequests} onChange={set("specialRequests")} />
      <Field label="Notes" value={value.notes} onChange={set("notes")} area />
    </div>
  )
}

function reservationPayload(value: ReturnType<typeof emptyReservation>) {
  const party = value.partySize.trim() === "" ? null : Number(value.partySize)
  return {
    reservationDate: value.reservationDate,
    reservationTime: value.reservationTime || null,
    confirmationNumber: value.confirmationNumber || null,
    bookingPlatform: value.bookingPlatform || null,
    status: value.status,
    notes: value.notes || null,
    partySize: party != null && Number.isFinite(party) ? party : null,
    totalCost: value.totalCost || null,
    bookingUrl: value.bookingUrl || null,
    specialRequests: value.specialRequests || null,
  }
}

function fromReservation(reservation: Reservation): ReturnType<typeof emptyReservation> {
  return {
    reservationDate: reservation.reservationDate?.slice(0, 10) ?? "",
    reservationTime: reservation.reservationTime ?? "",
    confirmationNumber: reservation.confirmationNumber ?? "",
    bookingPlatform: reservation.bookingPlatform ?? "",
    status: reservation.status || "confirmed",
    notes: reservation.notes ?? "",
    partySize: reservation.partySize != null ? String(reservation.partySize) : "",
    totalCost: reservation.totalCost ?? "",
    bookingUrl: reservation.bookingUrl ?? "",
    specialRequests: reservation.specialRequests ?? "",
  }
}

function PlanEditor({ api }: { api: SectionEditApi }) {
  const { draft, setField, place } = api
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [form, setForm] = React.useState(emptyReservation)
  const [formError, setFormError] = React.useState<string | null>(null)

  const saveReservation = async () => {
    setFormError(null)
    if (!form.reservationDate) {
      setFormError("A reservation needs a date")
      return
    }
    const url = editingId
      ? `/api/places/${place.id}/reservations/${editingId}`
      : `/api/places/${place.id}/reservations`
    try {
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reservationPayload(form)),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error((data && typeof data.message === "string" && data.message) || "Couldn't save the reservation")
      }
      setAdding(false)
      setEditingId(null)
      setForm(emptyReservation())
      api.noteSaved()
      api.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't save the reservation"
      setFormError(message)
      api.noteError(message)
    }
  }

  const removeReservation = async (id: string) => {
    try {
      const response = await fetch(`/api/places/${place.id}/reservations/${id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Couldn't delete the reservation")
      api.noteSaved()
      api.refresh()
    } catch (error) {
      api.noteError(error instanceof Error ? error.message : "Couldn't delete the reservation")
    }
  }

  return (
    <div className="space-y-4">
      <EditorTitle id="plan" />
      <StarPicker label="Priority" value={draft.priority} onChange={(value) => setField("priority", value)} />
      <StarPicker label="Your rating" value={draft.ratingSelf} onChange={(value) => setField("ratingSelf", value)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Planned visit" type="date" value={draft.plannedVisit} onChange={(value) => setField("plannedVisit", value)} />
        <Field label="Last visited" type="date" value={draft.lastVisited} onChange={(value) => setField("lastVisited", value)} />
      </div>
      <TagField label="Going with" value={draft.companions} onChange={(value) => setField("companions", value)} placeholder="Add companion…" />
      <div className="space-y-2">
        <span className={LABEL}>Reservations</span>
        {place.reservations.map((reservation) => (
          <div key={reservation.id} className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5 text-sm">
            <Ticket className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {reservation.reservationDate?.slice(0, 10)}
              {reservation.bookingPlatform ? ` · ${reservation.bookingPlatform}` : ""}
            </span>
            <button
              type="button"
              aria-label={`Edit reservation ${reservation.confirmationNumber ?? reservation.reservationDate}`}
              onClick={() => {
                setEditingId(reservation.id)
                setAdding(true)
                setForm(fromReservation(reservation))
                setFormError(null)
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Delete reservation ${reservation.confirmationNumber ?? reservation.reservationDate}`}
              onClick={() => void removeReservation(reservation.id)}
              className="text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
        {adding ? (
          <div className="rounded-xl border bg-background p-3">
            <ReservationFields value={form} onChange={setForm} />
            {formError && <p role="alert" className="mt-2 text-sm text-destructive">{formError}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void saveReservation()} className="rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background">
                Save reservation
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  setEditingId(null)
                  setForm(emptyReservation())
                  setFormError(null)
                }}
                className="rounded-full border px-4 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingId(null)
              setForm(emptyReservation())
              setAdding(true)
            }}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed px-3.5 py-2.5 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add reservation
          </button>
        )}
      </div>
    </div>
  )
}

function GroundEditor({ api }: { api: SectionEditApi }) {
  const { draft, setField } = api
  return (
    <div className="space-y-4">
      <EditorTitle id="ground" />
      <Field label="Address" value={draft.address} onChange={(value) => setField("address", value)} area />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="City" value={draft.city} onChange={(value) => setField("city", value)} />
        <Field label="Region" value={draft.admin} onChange={(value) => setField("admin", value)} />
        <Field label="Country" value={draft.country} onChange={(value) => setField("country", value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" value={draft.lat} onChange={(value) => setField("lat", value)} />
        <Field label="Longitude" value={draft.lon} onChange={(value) => setField("lon", value)} />
      </div>
      <div>
        <span className={LABEL}>Hours</span>
        <div className="mt-1">
          <HoursEditor value={draft.hours} onChange={(hours) => setField("hours", hours)} />
        </div>
      </div>
      <Field label="Website" value={draft.website} onChange={(value) => setField("website", value)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Phone" value={draft.phone} onChange={(value) => setField("phone", value)} />
        <Field label="Email" value={draft.email} onChange={(value) => setField("email", value)} />
      </div>
    </div>
  )
}

function PhotosEditor({ api }: { api: SectionEditApi }) {
  const { place } = api
  const [error, setError] = React.useState<string | null>(null)
  const photos = place.attachments.filter((attachment) => attachment.type === "photo")
  const cover = photos.find((photo) => photo.isPrimary === 1) ?? photos[0]
  const ordered = cover ? [cover, ...photos.filter((photo) => photo !== cover)] : []

  const mutate = async (url: string, method: string, failure: string) => {
    try {
      const response = await fetch(url, { method })
      if (!response.ok) throw new Error(failure)
      setError(null)
      api.noteSaved()
      api.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : failure
      setError(message)
      api.noteError(message)
    }
  }

  return (
    <div className="space-y-4">
      <EditorTitle id="photos" />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {ordered.map((photo) => (
          <div key={photo.id} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.thumbnailUri || photo.uri} alt={photo.caption || ""} className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label={photo.isPrimary === 1 ? "Cover photo" : "Set as cover"}
              onClick={() => void mutate(`/api/places/${place.id}/attachments/${photo.id}/primary`, "PUT", "Couldn't set the cover")}
              className={cn(
                "absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full",
                photo.isPrimary === 1 ? "bg-primary text-primary-foreground" : "bg-black/40 text-white"
              )}
            >
              <Star className={cn("h-3.5 w-3.5", photo.isPrimary === 1 && "fill-current")} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Delete photo"
              onClick={() => void mutate(`/api/places/${place.id}/attachments/${photo.id}`, "DELETE", "Couldn't delete the photo")}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
        <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs text-muted-foreground">
          <Upload className="h-5 w-5" aria-hidden />
          <PhotoUploader placeId={place.id} onUploadComplete={() => api.refresh()} onUploadError={setError} maxFiles={8} compact className="text-xs" />
        </div>
        <div className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
          <FindImageButton
            placeId={place.id}
            placeName={place.name}
            placeCity={place.city}
            hasGooglePlaceId={Boolean(place.googlePlaceId)}
            onAttached={() => api.refresh()}
            buttonVariant="ghost"
            className="h-auto flex-col gap-1 px-2 text-xs text-muted-foreground"
          />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">The star sets the cover. Photo credits stay on the place.</p>
    </div>
  )
}

function LinksEditor({ api }: { api: SectionEditApi }) {
  const { place } = api
  const [url, setUrl] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const add = async () => {
    if (!url.trim()) return
    setError(null)
    try {
      const response = await fetch(`/api/places/${place.id}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), title: title.trim() || undefined, type: "website" }),
      })
      if (!response.ok) throw new Error("Couldn't add the link")
      setUrl("")
      setTitle("")
      api.noteSaved()
      api.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't add the link"
      setError(message)
      api.noteError(message)
    }
  }

  const remove = async (id: string) => {
    try {
      const response = await fetch(`/api/places/${place.id}/links/${id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Couldn't delete the link")
      api.noteSaved()
      api.refresh()
    } catch (err) {
      api.noteError(err instanceof Error ? err.message : "Couldn't delete the link")
    }
  }

  return (
    <div className="space-y-4">
      <EditorTitle id="links" />
      {place.links.map((link) => (
        <div key={link.id} className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5 text-sm">
          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{link.title || link.url}</span>
          <button type="button" aria-label={`Delete link ${link.title || link.url}`} onClick={() => void remove(link.id)} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Link title" value={title} onChange={setTitle} placeholder="Optional" />
        <Field label="URL" value={url} onChange={setUrl} placeholder="https://" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        onClick={() => void add()}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed px-3.5 py-2.5 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add link
      </button>
    </div>
  )
}

export function SectionEditor({ id, api }: { id: SectionId; api: SectionEditApi }) {
  const { draft, setField } = api
  if (id === "why") {
    return (
      <div className="space-y-4">
        <EditorTitle id="why" />
        <Field label="Your note" value={draft.notes} onChange={(value) => setField("notes", value)} area />
        <Field label="Recommended by" value={draft.recommendedBy} onChange={(value) => setField("recommendedBy", value)} />
      </div>
    )
  }
  if (id === "about") {
    return (
      <div className="space-y-4">
        <EditorTitle id="about" />
        <Field label="Description" value={draft.description} onChange={(value) => setField("description", value)} area />
        <TagField label="Alternative names" value={draft.altNames} onChange={(value) => setField("altNames", value)} placeholder="Add a name…" />
      </div>
    )
  }
  if (id === "know") {
    return (
      <div className="space-y-4">
        <EditorTitle id="know" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Best time" value={draft.best_time} onChange={(value) => setField("best_time", value)} />
          <Field label="Price level" value={draft.price_level} onChange={(value) => setField("price_level", value)} />
        </div>
        <TagField label="Things to do" value={draft.activities} onChange={(value) => setField("activities", value)} placeholder="Add activity…" />
        <TagField label="Food & drink" value={draft.cuisine} onChange={(value) => setField("cuisine", value)} placeholder="Add cuisine…" />
        <TagField label="Amenities" value={draft.amenities} onChange={(value) => setField("amenities", value)} placeholder="Add amenity…" />
        <TagField label="Vibes" value={draft.vibes} onChange={(value) => setField("vibes", value)} placeholder="Add vibe…" />
        <TagField label="Tags" value={draft.tags} onChange={(value) => setField("tags", value)} placeholder="Add tag…" />
        <Field label="Practical info" value={draft.practicalInfo} onChange={(value) => setField("practicalInfo", value)} area />
      </div>
    )
  }
  if (id === "photos") return <PhotosEditor api={api} />
  if (id === "links") return <LinksEditor api={api} />
  if (id === "plan") return <PlanEditor api={api} />
  return <GroundEditor api={api} />
}
