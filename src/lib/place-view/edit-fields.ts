import type { PlaceWithRelations } from "@/types/database"

/** Sections the Postcard can edit, in the order they appear on the page. */
export type EditSectionId = "why" | "plan" | "ground" | "about" | "know" | "photos" | "links"

export const EDIT_SECTION_ORDER: EditSectionId[] = ["why", "plan", "ground", "about", "know", "photos", "links"]

export const EDIT_SECTION_LABELS: Record<EditSectionId, string> = {
  why: "Why it's here",
  plan: "Your plan",
  ground: "On the ground",
  about: "About",
  know: "Good to know",
  photos: "Photos",
  links: "Links & reading",
}

export interface EditField {
  id: string
  section: EditSectionId
  /** Noun phrase used in “+ Add {label}”. */
  label: string
  missing: (place: PlaceWithRelations) => boolean
  summary: (place: PlaceWithRelations) => string | null
}

const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null)
const list = (value: string[] | null | undefined) => (value ?? []).map((item) => item.trim()).filter(Boolean)

function hasHours(hours: PlaceWithRelations["hours"]): boolean {
  if (!hours || typeof hours !== "object") return false
  return Object.values(hours).some((value) => typeof value === "string" && value.trim().length > 0)
}

function photoCount(place: PlaceWithRelations): number {
  return place.attachments.filter((attachment) => attachment.type === "photo").length
}

export const EDIT_FIELDS: EditField[] = [
  { id: "notes", section: "why", label: "your note", missing: (p) => !text(p.notes), summary: (p) => text(p.notes) },
  { id: "recommendedBy", section: "why", label: "who recommended it", missing: (p) => !text(p.recommendedBy), summary: (p) => text(p.recommendedBy) },
  { id: "priority", section: "plan", label: "a priority", missing: (p) => !(p.priority ?? 0), summary: (p) => (p.priority ? `Priority ${p.priority} of 5` : null) },
  { id: "ratingSelf", section: "plan", label: "your rating", missing: (p) => !(p.ratingSelf ?? 0), summary: (p) => (p.ratingSelf ? `Rating ${p.ratingSelf} of 5` : null) },
  { id: "plannedVisit", section: "plan", label: "a planned date", missing: (p) => !text(p.plannedVisit), summary: (p) => text(p.plannedVisit) },
  { id: "lastVisited", section: "plan", label: "a last-visited date", missing: (p) => !text(p.lastVisited), summary: (p) => text(p.lastVisited) },
  { id: "companions", section: "plan", label: "companions", missing: (p) => list(p.companions).length === 0, summary: (p) => (list(p.companions).length ? list(p.companions).join(", ") : null) },
  { id: "reservations", section: "plan", label: "a reservation", missing: (p) => p.reservations.length === 0, summary: (p) => (p.reservations.length ? `${p.reservations.length} reservation${p.reservations.length === 1 ? "" : "s"}` : null) },
  { id: "address", section: "ground", label: "an address", missing: (p) => !text(p.address), summary: (p) => text(p.address) },
  { id: "city", section: "ground", label: "a city", missing: (p) => !text(p.city), summary: (p) => text(p.city) },
  { id: "admin", section: "ground", label: "a region", missing: (p) => !text(p.admin), summary: (p) => text(p.admin) },
  { id: "country", section: "ground", label: "a country", missing: (p) => !text(p.country), summary: (p) => text(p.country) },
  {
    id: "coords",
    section: "ground",
    label: "coordinates",
    missing: (p) => !(p.coords && Number.isFinite(p.coords.lat) && Number.isFinite(p.coords.lon)),
    summary: (p) => (p.coords && Number.isFinite(p.coords.lat) && Number.isFinite(p.coords.lon) ? `${p.coords.lat}, ${p.coords.lon}` : null),
  },
  { id: "hours", section: "ground", label: "opening hours", missing: (p) => !hasHours(p.hours), summary: (p) => (hasHours(p.hours) ? "Hours added" : null) },
  { id: "website", section: "ground", label: "a website", missing: (p) => !text(p.website), summary: (p) => text(p.website) },
  { id: "phone", section: "ground", label: "a phone number", missing: (p) => !text(p.phone), summary: (p) => text(p.phone) },
  { id: "email", section: "ground", label: "an email", missing: (p) => !text(p.email), summary: (p) => text(p.email) },
  { id: "description", section: "about", label: "a description", missing: (p) => !text(p.description), summary: (p) => text(p.description) },
  { id: "altNames", section: "about", label: "an alternative name", missing: (p) => list(p.altNames).length === 0, summary: (p) => (list(p.altNames).length ? list(p.altNames).join(", ") : null) },
  { id: "best_time", section: "know", label: "best time", missing: (p) => !text(p.best_time), summary: (p) => text(p.best_time) },
  { id: "price_level", section: "know", label: "a price level", missing: (p) => !text(p.price_level), summary: (p) => text(p.price_level) },
  { id: "activities", section: "know", label: "things to do", missing: (p) => list(p.activities).length === 0, summary: (p) => (list(p.activities).length ? list(p.activities).join(", ") : null) },
  { id: "cuisine", section: "know", label: "food and drink", missing: (p) => list(p.cuisine).length === 0, summary: (p) => (list(p.cuisine).length ? list(p.cuisine).join(", ") : null) },
  { id: "amenities", section: "know", label: "amenities", missing: (p) => list(p.amenities).length === 0, summary: (p) => (list(p.amenities).length ? list(p.amenities).join(", ") : null) },
  { id: "vibes", section: "know", label: "vibes", missing: (p) => list(p.vibes).length === 0, summary: (p) => (list(p.vibes).length ? list(p.vibes).join(", ") : null) },
  { id: "tags", section: "know", label: "tags", missing: (p) => list(p.tags).length === 0, summary: (p) => (list(p.tags).length ? list(p.tags).join(", ") : null) },
  { id: "practicalInfo", section: "know", label: "practical info", missing: (p) => !text(p.practicalInfo), summary: (p) => text(p.practicalInfo) },
  { id: "photos", section: "photos", label: "a photo", missing: (p) => photoCount(p) === 0, summary: (p) => (photoCount(p) ? `${photoCount(p)} photo${photoCount(p) === 1 ? "" : "s"}` : null) },
  { id: "links", section: "links", label: "a link", missing: (p) => p.links.length === 0, summary: (p) => (p.links.length ? `${p.links.length} link${p.links.length === 1 ? "" : "s"}` : null) },
]

export function fieldsFor(section: EditSectionId): EditField[] {
  return EDIT_FIELDS.filter((field) => field.section === section)
}

/** Whether the read-mode section already renders a body. Plan and On the ground always do. */
export function sectionHasVisibleBody(id: EditSectionId, place: PlaceWithRelations): boolean {
  switch (id) {
    case "why":
      return Boolean(text(place.notes) || text(place.recommendedBy))
    case "about":
      return Boolean(text(place.description) || list(place.altNames).length)
    case "know":
      return Boolean(
        text(place.best_time) ||
          text(place.price_level) ||
          text(place.practicalInfo) ||
          list(place.activities).length ||
          list(place.cuisine).length ||
          list(place.amenities).length ||
          list(place.tags).length
      )
    case "photos":
      return photoCount(place) > 0
    case "links":
      return place.links.length > 0
    case "plan":
    case "ground":
      return true
    default:
      return true
  }
}

export interface EditIndexRow {
  key: string
  section: EditSectionId
  title: string
  detail: string
  add: boolean
}

/** One row per section, plus a “+ Add” row for each missing field. */
export function editIndexRows(place: PlaceWithRelations): EditIndexRow[] {
  const rows: EditIndexRow[] = []
  for (const section of EDIT_SECTION_ORDER) {
    const fields = fieldsFor(section)
    const present = fields.filter((field) => !field.missing(place))
    const summary = present.map((field) => field.summary(place)).filter((value): value is string => Boolean(value))
    rows.push({
      key: section,
      section,
      title: EDIT_SECTION_LABELS[section],
      detail: summary[0] ?? "Nothing here yet",
      add: false,
    })
    for (const field of fields) {
      if (!field.missing(place)) continue
      rows.push({
        key: `${section}-${field.id}`,
        section,
        title: EDIT_SECTION_LABELS[section],
        detail: `+ Add ${field.label}`,
        add: true,
      })
    }
  }
  return rows
}
