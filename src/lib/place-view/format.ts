import type { PlaceLink, Source } from '@/types/database'

/*
 * Formatting for the place view. Every helper here is pure and timezone-stable, so the
 * server render and the client hydration always agree.
 */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * "2026-11-18" -> "Wed, Nov 18, 2026". Date-only strings are calendar days, not instants:
 * `new Date("2026-11-18")` is UTC midnight and renders as Nov 17 west of Greenwich.
 */
export function formatDateOnly(value: string | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}): string | null {
  if (!value) return null
  const d = parseDateOnly(value)
  if (!d) return value
  const { weekday = true, year = true } = opts
  const day = `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
  return `${weekday ? `${WEEKDAYS_SHORT[d.getUTCDay()]}, ` : ''}${day}${year ? `, ${d.getUTCFullYear()}` : ''}`
}

/** An ISO timestamp as a calendar date ("Apr 14, 2024"), read in UTC. */
export function formatSavedDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** An ISO timestamp as a labelled UTC date-time ("Sep 30, 2026, 10:00 AM UTC"). */
export function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const suffix = d.getUTCHours() < 12 ? 'AM' : 'PM'
  const h12 = d.getUTCHours() % 12 === 0 ? 12 : d.getUTCHours() % 12
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${h12}:${minutes} ${suffix} UTC`
}

/** "17:30" -> "5:30 PM"; anything unparseable is returned as written. */
export function formatTime(value: string | null | undefined): string | null {
  if (!value) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!m) return value
  const h = Number(m[1])
  if (h > 23) return value
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${suffix}`
}

export const HOURS_DAYS = [
  ['monday', 'Mon'],
  ['tuesday', 'Tue'],
  ['wednesday', 'Wed'],
  ['thursday', 'Thu'],
  ['friday', 'Fri'],
  ['saturday', 'Sat'],
  ['sunday', 'Sun'],
] as const

function isAllDay(range: string): boolean {
  const compact = range.replace(/\s+/g, '').toLowerCase()
  return compact === '24h' || compact === '24hours' || compact === 'open24hours' || /^0?0:00-(23:59|24:00|00:00)$/.test(compact)
}

function formatRange(range: string): string {
  if (range.trim().toLowerCase() === 'closed') return 'Closed'
  if (isAllDay(range)) return 'Open 24 hours'
  const parts = range.split('-').map((p) => p.trim())
  if (parts.length !== 2) return range
  return `${formatTime(parts[0])}–${formatTime(parts[1])}`
}

export interface HoursSummary {
  /** One line, e.g. "Open 24 hours, every day" or "Mon–Fri 9:00 AM–5:00 PM · Sat–Sun Closed". */
  summary: string
  /** The week as written, Monday first; days with no entry are omitted. */
  days: Array<{ day: string; label: string; value: string }>
}

/** Summarises the `hours` JSON (`{ monday: "09:00-17:00", sunday: "closed" }`). */
export function summarizeHours(hours: Record<string, unknown> | null | undefined): HoursSummary | null {
  if (!hours || typeof hours !== 'object') return null
  const byDay = new Map<string, unknown>()
  for (const [key, value] of Object.entries(hours)) byDay.set(key.toLowerCase(), value)
  // The schema comment also allows `closed: ["sunday"]` alongside per-day ranges.
  const closed = byDay.get('closed')
  const closedDays = new Set(Array.isArray(closed) ? closed.filter((d): d is string => typeof d === 'string').map((d) => d.toLowerCase()) : [])

  const days = HOURS_DAYS.flatMap(([day, label]) => {
    const raw = byDay.get(day)
    if (typeof raw === 'string' && raw.trim()) return [{ day, label, value: formatRange(raw) }]
    if (closedDays.has(day)) return [{ day, label, value: 'Closed' }]
    return []
  })
  if (days.length === 0) return null

  if (days.length === 7 && days.every((d) => d.value === days[0].value)) {
    return { summary: `${days[0].value}, every day`, days }
  }

  // Group consecutive days with the same value: "Mon–Fri 9:00 AM–5:00 PM".
  const groups: Array<{ from: string; to: string; value: string; lastIndex: number }> = []
  for (const d of days) {
    const index = HOURS_DAYS.findIndex(([key]) => key === d.day)
    const last = groups[groups.length - 1]
    if (last && last.value === d.value && last.lastIndex === index - 1) {
      last.to = d.label
      last.lastIndex = index
    } else {
      groups.push({ from: d.label, to: d.label, value: d.value, lastIndex: index })
    }
  }
  const summary = groups.map((g) => `${g.from === g.to ? g.from : `${g.from}–${g.to}`} ${g.value}`).join(' · ')
  return { summary, days }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** A link card's label: its stored title when there is one, otherwise the URL itself. */
export function linkLabel(link: Pick<PlaceLink, 'url' | 'title'>): { title: string; domain: string | null } {
  const domain = hostnameOf(link.url)
  const title = link.title?.trim() || domain || link.url
  return { title, domain }
}

/** "https://inari.jp/en/" -> "inari.jp/en" for display next to an icon. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  twitter: 'X',
  x: 'X',
  blog: 'Blog',
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  screenshot: 'Screenshot',
  url: 'Web page',
  note: 'Note',
}

/** What a source card says about where a place came from. */
export function describeSource(source: Pick<Source, 'type' | 'meta' | 'createdAt'>): {
  title: string
  detail: string[]
  url: string | null
} {
  const meta = source.meta ?? {}
  const platform = meta.platform ? PLATFORM_LABELS[meta.platform.toLowerCase()] ?? meta.platform : null
  const typeLabel = SOURCE_TYPE_LABELS[source.type] ?? source.type
  const title = platform ? `${platform} ${typeLabel.toLowerCase()}` : typeLabel
  const filename = meta.filename || meta.uploadInfo?.originalName || null
  const url = meta.url || null
  const detail = [
    meta.author || null,
    !platform && url ? hostnameOf(url) : null,
    formatSavedDate(source.createdAt),
    filename,
  ].filter((v): v is string => Boolean(v))
  return { title, detail, url }
}

/** Mirrors the thresholds the record card has always used. */
export function confidenceLabel(confidence: number | null | undefined): { label: string; tone: 'high' | 'medium' | 'low' | 'very-low' | 'unknown' } {
  if (!confidence) return { label: 'Unknown', tone: 'unknown' }
  const pct = `${(confidence * 100).toFixed(0)}%`
  if (confidence >= 0.9) return { label: `High (${pct})`, tone: 'high' }
  if (confidence >= 0.8) return { label: `Medium (${pct})`, tone: 'medium' }
  if (confidence >= 0.6) return { label: `Low (${pct})`, tone: 'low' }
  return { label: `Very low (${pct})`, tone: 'very-low' }
}

export const VISIT_STATUS_LABELS: Record<string, string> = {
  not_visited: 'Want to go',
  planned: 'Planned',
  visited: 'Been there',
}

/**
 * An href for a stored, user- or pipeline-supplied URL: http(s) only, with a bare
 * "inari.jp/en" treated as https. Anything else (javascript:, data:, garbage) is null, so
 * the caller renders text instead of a link.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
