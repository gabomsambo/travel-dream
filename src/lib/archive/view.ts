/**
 * Archive's filter, sort and view rules. Client-safe: no database imports.
 * Filtering matches the Library's rules so Has Photos, kinds, tags, vibes,
 * rating and visit status behave the same once they sit behind Filters.
 */
import type { AttributionMeta } from '@/db/schema/attachments'
import { citiesMatch } from '@/lib/city-names'
import { EMPTY_FILTERS, type LibraryFilterState } from '@/lib/library/filters'

export type ArchiveView = 'list' | 'grid' | 'journal'

export interface ArchiveTrip {
  id: string
  name: string
}

export interface ArchivePlace {
  id: string
  name: string
  kind: string
  city: string | null
  country: string | null
  description: string | null
  notes: string | null
  tags: string[]
  vibes: string[]
  ratingSelf: number
  visitStatus: string
  priceLevel: string | null
  coverUrl: string | null
  coverAttribution: AttributionMeta | null
  coverSource: string | null
  createdAt: string
  archivedAt: string | null
  trips: ArchiveTrip[]
  status: 'archived'
}

export const ARCHIVE_VIEWS: ArchiveView[] = ['list', 'grid', 'journal']

export const ARCHIVE_SORTS = [
  { value: 'archived-newest', label: 'Recently set aside' },
  { value: 'date-newest', label: 'Recently saved' },
  { value: 'date-oldest', label: 'Oldest saved' },
  { value: 'rating-high', label: 'Rating (highest)' },
  { value: 'rating-low', label: 'Rating (lowest)' },
  { value: 'name-az', label: 'Name (A–Z)' },
  { value: 'name-za', label: 'Name (Z–A)' },
  { value: 'kind', label: 'Kind' },
] as const

export const DEFAULT_ARCHIVE_SORT = 'archived-newest'
export const DEFAULT_ARCHIVE_VIEW: ArchiveView = 'list'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** City and country only when they exist. Never a bare comma. */
export function locationLine(city: string | null | undefined, country: string | null | undefined): string | null {
  const parts = [city, country].map((s) => s?.trim()).filter((s): s is string => Boolean(s))
  return parts.length ? parts.join(', ') : null
}

/**
 * Rows with no archive clock say when they were saved. They never claim
 * a set-aside date we do not have.
 */
export function setAsideLine(archivedAt: string | null | undefined, createdAt: string): string {
  if (archivedAt) return `Set aside ${formatDay(archivedAt)}`
  return `Saved ${formatDay(createdAt)}`
}

export function parseArchiveView(value: string | null): ArchiveView {
  return ARCHIVE_VIEWS.includes(value as ArchiveView) ? (value as ArchiveView) : DEFAULT_ARCHIVE_VIEW
}

export function parseArchiveSort(value: string | null): string {
  return ARCHIVE_SORTS.some((s) => s.value === value) ? (value as string) : DEFAULT_ARCHIVE_SORT
}

export function archiveSearchParams(
  f: LibraryFilterState,
  extra: { view: ArchiveView; sort: string }
): URLSearchParams {
  const p = new URLSearchParams()
  if (f.search) p.set('search', f.search)
  if (f.kinds.size) p.set('kind', [...f.kinds].join(','))
  for (const city of f.cities) p.append('city', city)
  for (const country of f.countries) p.append('country', country)
  if (f.tags.size) p.set('tags', [...f.tags].join(','))
  if (f.vibes.size) p.set('vibes', [...f.vibes].join(','))
  if (f.rating > 0) p.set('rating', String(f.rating))
  if (f.visitStatus.size) p.set('visitStatus', [...f.visitStatus].join(','))
  if (f.photo !== 'any') p.set('photo', f.photo)
  if (extra.view !== DEFAULT_ARCHIVE_VIEW) p.set('view', extra.view)
  if (extra.sort !== DEFAULT_ARCHIVE_SORT) p.set('sort', extra.sort)
  return p
}

export function filterArchive(
  items: ArchivePlace[],
  f: LibraryFilterState,
  searchIds: Set<string> | null
): ArchivePlace[] {
  return items.filter((p) => {
    if (searchIds && !searchIds.has(p.id)) return false
    if (f.kinds.size && !f.kinds.has(p.kind)) return false
    if (f.cities.size && ![...f.cities].some((city) => citiesMatch(p.city, city))) return false
    if (f.countries.size && !(p.country && f.countries.has(p.country.trim()))) return false
    if (f.tags.size && !p.tags.some((t) => f.tags.has(t))) return false
    if (f.vibes.size && !p.vibes.some((v) => f.vibes.has(v))) return false
    if (f.rating > 0 && p.ratingSelf < f.rating) return false
    if (f.visitStatus.size && !f.visitStatus.has(p.visitStatus || 'not_visited')) return false
    if (f.photo === 'with' && !p.coverUrl) return false
    if (f.photo === 'without' && p.coverUrl) return false
    return true
  })
}

const time = (s: string | null | undefined) => (s ? new Date(s).getTime() : Number.NaN)

export function sortArchive(items: ArchivePlace[], sort: string): ArchivePlace[] {
  const list = [...items]
  switch (sort) {
    case 'date-oldest':
      return list.sort((a, b) => time(a.createdAt) - time(b.createdAt))
    case 'rating-high':
      return list.sort((a, b) => b.ratingSelf - a.ratingSelf)
    case 'rating-low':
      return list.sort((a, b) => a.ratingSelf - b.ratingSelf)
    case 'name-az':
      return list.sort((a, b) => a.name.localeCompare(b.name))
    case 'name-za':
      return list.sort((a, b) => b.name.localeCompare(a.name))
    case 'kind':
      return list.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    case 'date-newest':
      return list.sort((a, b) => time(b.createdAt) - time(a.createdAt))
    case 'archived-newest':
    default:
      return list.sort((a, b) => {
        const at = time(a.archivedAt)
        const bt = time(b.archivedAt)
        const aMissing = Number.isNaN(at)
        const bMissing = Number.isNaN(bt)
        if (aMissing && bMissing) return time(b.createdAt) - time(a.createdAt)
        if (aMissing) return 1
        if (bMissing) return -1
        return bt - at
      })
  }
}

export { EMPTY_FILTERS }
