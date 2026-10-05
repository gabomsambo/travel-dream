/**
 * Turns the (already filtered and sorted) Library into chapters for the
 * selected grouping, plus the small text helpers every view shares. Pure and
 * client-safe; the order of places inside a chapter is the order they came in.
 */
import { groupBySlug } from '@/lib/explore/atlas';
import { flagFor, slugify } from '@/lib/explore/geo';
import { kindLabel } from '@/components/explore/kind-icon';
import type { ExploreCollection } from '@/lib/explore/types';
import type { GroupMode, LibraryItem } from './types';

export interface Chapter {
  key: string;
  title: string;
  /** Small line above the title ("Coming up · May 2027", "Japan"). */
  eyebrow?: string;
  flag?: string;
  /** Where the chapter continues outside the Library (a country's atlas page, a collection). */
  href?: string;
  hrefLabel?: string;
  items: LibraryItem[];
}

export const GROUP_MODES: Array<{ value: GroupMode; label: string; hint: string }> = [
  { value: 'country', label: 'Country', hint: 'One chapter per country' },
  { value: 'city', label: 'City', hint: 'One chapter per city' },
  { value: 'collection', label: 'Collection', hint: 'Trips & lists, then the rest' },
  { value: 'shelf', label: 'Shelf', hint: 'Planned · Dreaming · Been' },
  { value: 'kind', label: 'Kind', hint: 'Landmarks, cafés, beaches…' },
  { value: 'month', label: 'Best month to go', hint: 'From the best-time notes' },
  { value: 'saved', label: 'Date saved', hint: 'By the month you saved it' },
  { value: 'none', label: 'No grouping', hint: 'One grid' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Dates in the DB are ISO strings, often date-only; read them in UTC so a day never slips. */
function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function monthYear(iso: string | null | undefined): string | null {
  const d = parse(iso);
  return d ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;
}

export function fullDate(iso: string | null | undefined): string | null {
  const d = parse(iso);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
}

export type Caption = { text: string; quote?: boolean };

/**
 * Why this place matters, in the first form that applies: when you went, when
 * you're going, your own note, who told you, when to go.
 */
export function captionFor(p: LibraryItem): Caption | undefined {
  const been = p.visitStatus === 'visited' ? monthYear(p.lastVisited) : null;
  if (been) return { text: `Been · ${been}` };
  const planned = p.visitStatus === 'planned' ? fullDate(p.plannedVisit) : null;
  if (planned) return { text: `Planned · ${planned}` };
  if (p.notes?.trim()) return { text: p.notes.trim(), quote: true };
  if (p.recommendedBy?.trim()) return { text: `Tip from ${p.recommendedBy.trim()}` };
  if (p.bestTimeText?.trim()) return { text: `Best: ${p.bestTimeText.trim()}` };
  return undefined;
}

export function locationOf(p: Pick<LibraryItem, 'city' | 'country'>): string {
  return [p.city, p.country].filter(Boolean).join(', ');
}

function byCount(a: Chapter, b: Chapter): number {
  return b.items.length - a.items.length || a.title.localeCompare(b.title);
}

function byCountry(items: LibraryItem[]): Chapter[] {
  const located = items.filter((p) => p.country?.trim());
  const chapters: Chapter[] = groupBySlug(located, (p) => p.country!.trim()).map((g) => ({
    key: `country:${g.slug}`,
    title: g.name,
    flag: flagFor(g.name) || undefined,
    href: `/explore/atlas/${g.slug}`,
    hrefLabel: `Open ${g.name} in the atlas`,
    items: g.places as LibraryItem[],
  }));
  chapters.sort(byCount);
  const nowhere = items.filter((p) => !p.country?.trim());
  if (nowhere.length) chapters.push({ key: 'country:none', title: 'No country yet', items: nowhere });
  return chapters;
}

function byCity(items: LibraryItem[]): Chapter[] {
  const located = items.filter((p) => p.city?.trim());
  const chapters: Chapter[] = groupBySlug(located, (p) => `${p.city!.trim()}\u0000${p.country?.trim() ?? ''}`).map((g) => {
    const [city, country] = g.name.split('\u0000');
    const countrySlug = country ? slugify(country) : null;
    return {
      key: `city:${g.slug}`,
      title: city,
      eyebrow: country || undefined,
      flag: flagFor(country) || undefined,
      href: countrySlug ? `/explore/atlas/${countrySlug}/${slugify(city)}` : undefined,
      hrefLabel: `Open ${city} in the atlas`,
      items: g.places as LibraryItem[],
    };
  });
  chapters.sort(byCount);
  const nowhere = items.filter((p) => !p.city?.trim());
  if (nowhere.length) chapters.push({ key: 'city:none', title: 'No city yet', items: nowhere });
  return chapters;
}

/** "Coming up · May 2027", "A memory · Sep 2023", or nothing for a plain list. */
export function collectionEyebrow(items: LibraryItem[], now: Date): string | undefined {
  const upcoming = items
    .map((p) => (p.visitStatus === 'planned' ? parse(p.plannedVisit) : null))
    .filter((d): d is Date => !!d && d.getTime() >= now.getTime() - 86_400_000)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (upcoming) return `Coming up · ${monthYear(upcoming.toISOString())}`;
  if (items.length && items.every((p) => p.visitStatus === 'visited')) {
    const last = items
      .map((p) => parse(p.lastVisited))
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return last ? `A memory · ${monthYear(last.toISOString())}` : 'A memory';
  }
  return undefined;
}

function byCollection(items: LibraryItem[], collections: ExploreCollection[], now: Date): Chapter[] {
  const chapters: Chapter[] = [];
  const placed = new Set<string>();
  for (const c of collections) {
    const ids = new Set(c.placeIds);
    const members = items.filter((p) => ids.has(p.id));
    if (!members.length) continue;
    members.forEach((p) => placed.add(p.id));
    chapters.push({
      key: `collection:${c.id}`,
      title: c.name,
      eyebrow: collectionEyebrow(members, now),
      href: `/collections/${c.id}`,
      hrefLabel: 'Open the collection',
      items: members,
    });
  }
  chapters.sort(byCount);
  const loose = items.filter((p) => !placed.has(p.id));
  if (loose.length) chapters.push({ key: 'collection:none', title: 'Not in a collection yet', items: loose });
  return chapters;
}

function byShelf(items: LibraryItem[]): Chapter[] {
  const shelves: Array<[LibraryItem['visitStatus'], string]> = [
    ['planned', 'Planned'],
    ['not_visited', 'Still dreaming'],
    ['visited', 'Been'],
  ];
  return shelves
    .map(([status, title]) => ({ key: `shelf:${status}`, title, items: items.filter((p) => p.visitStatus === status) }))
    .filter((c) => c.items.length);
}

function byKind(items: LibraryItem[]): Chapter[] {
  const groups = new Map<string, LibraryItem[]>();
  for (const p of items) groups.set(p.kind, [...(groups.get(p.kind) ?? []), p]);
  return [...groups].map(([kind, list]) => ({ key: `kind:${kind}`, title: kindLabel(kind), items: list })).sort(byCount);
}

/**
 * Best month to go, starting from this month. A place good in several months
 * appears in each of them — that is the point of reading by season.
 */
function byMonth(items: LibraryItem[], now: Date): Chapter[] {
  const current = now.getUTCMonth();
  const chapters: Chapter[] = [];
  for (let i = 0; i < 12; i++) {
    const m = (current + i) % 12;
    const list = items.filter((p) => !p.bestTime.yearRound && p.bestTime.months.includes(m + 1));
    if (!list.length) continue;
    chapters.push({
      key: `month:${m + 1}`,
      title: MONTHS[m],
      eyebrow: i === 0 ? 'This month' : i === 1 ? 'Next month' : undefined,
      items: list,
    });
  }
  const anytime = items.filter((p) => p.bestTime.yearRound);
  if (anytime.length) chapters.push({ key: 'month:any', title: 'Any time of year', items: anytime });
  const unknown = items.filter((p) => !p.bestTime.yearRound && p.bestTime.months.length === 0);
  if (unknown.length) chapters.push({ key: 'month:none', title: 'No best time yet', items: unknown });
  return chapters;
}

function bySaved(items: LibraryItem[]): Chapter[] {
  const groups = new Map<string, { title: string; at: number; items: LibraryItem[] }>();
  for (const p of items) {
    const d = parse(p.createdAt);
    const key = d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` : 'unknown';
    const g = groups.get(key) ?? {
      title: d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : 'Some time ago',
      at: d ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth()) : 0,
      items: [],
    };
    g.items.push(p);
    groups.set(key, g);
  }
  return [...groups]
    .sort((a, b) => b[1].at - a[1].at)
    .map(([key, g]) => ({ key: `saved:${key}`, title: g.title, eyebrow: 'Saved in', items: g.items }));
}

export function buildChapters(
  items: LibraryItem[],
  mode: GroupMode,
  collections: ExploreCollection[],
  now: Date
): Chapter[] {
  if (!items.length) return [];
  switch (mode) {
    case 'country':
      return byCountry(items);
    case 'city':
      return byCity(items);
    case 'collection':
      return byCollection(items, collections, now);
    case 'shelf':
      return byShelf(items);
    case 'kind':
      return byKind(items);
    case 'month':
      return byMonth(items, now);
    case 'saved':
      return bySaved(items);
    case 'none':
    default:
      return [{ key: 'all', title: 'Every place', items }];
  }
}

/** "16 places · 3 cities · 7 been · 7 planned" */
export function chapterSummary(items: LibraryItem[], withCities = true): string {
  const cities = new Set(items.map((p) => p.city?.trim().toLowerCase()).filter(Boolean)).size;
  const been = items.filter((p) => p.visitStatus === 'visited').length;
  const planned = items.filter((p) => p.visitStatus === 'planned').length;
  return [
    `${items.length} ${items.length === 1 ? 'place' : 'places'}`,
    withCities && cities > 1 ? `${cities} cities` : null,
    been ? `${been} been` : null,
    planned ? `${planned} planned` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** City chips for a country chapter: most-saved first. */
export function citiesOf(items: LibraryItem[]): Array<{ city: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of items) {
    const c = p.city?.trim();
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}
