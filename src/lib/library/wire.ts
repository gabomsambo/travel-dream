/**
 * The Library's index as it travels: one slim JSON document per library
 * version, fetched once and kept by the browser, instead of riding inside the
 * page on every visit.
 *
 * Slimming is lossless for what the Library reads. Empty and default fields
 * are left out, the parsed best time is worked out again from its text, and a
 * place carries its first photo plus a count (quick look asks for the rest when
 * it opens). Brotli already removes repeated keys, so the saving that matters
 * is parse time and memory, not bytes on the wire.
 *
 * Pure and client-safe: the route encodes, the browser decodes.
 */
import { parseBestTime } from '@/lib/explore/best-time';
import type { ExploreCollection, ExplorePhoto } from '@/lib/explore/types';
import type { LibraryItem } from './types';

/**
 * Bump when the encoding changes. It is part of the version key, so the URL of
 * every cached index changes with it and no browser decodes an old shape.
 */
export const WIRE_FORMAT = 1;

/** A place on the wire. Every optional field is absent when it holds the default. */
export interface WireItem {
  id: string;
  name: string;
  kind: string;
  createdAt: string;
  city?: string;
  country?: string;
  description?: string;
  notes?: string;
  vibes?: string[];
  /** `bestTimeText`; the parsed `bestTime` is not sent. */
  bestTime?: string;
  recommendedBy?: string;
  /** Absent means `not_visited`. */
  visit?: 'visited' | 'planned';
  priority?: number;
  rating?: number;
  price?: string;
  lastVisited?: string;
  plannedVisit?: string;
  lat?: number;
  lon?: number;
  /** The primary photo. */
  photo?: ExplorePhoto;
  /** How many photos the place has, only when it has more than the one sent. */
  photoCount?: number;
  tags?: string[];
  address?: string;
  altNames?: string[];
  cuisine?: string[];
  activities?: string[];
  amenities?: string[];
  practicalInfo?: string;
}

export interface LibraryIndexWire {
  format: typeof WIRE_FORMAT;
  version: string;
  items: WireItem[];
  collections: ExploreCollection[];
}

/** What the browser keeps: the places and collections of one library version. */
export interface LibraryIndexContent {
  version: string;
  items: LibraryItem[];
  collections: ExploreCollection[];
}

export function encodeItem(p: LibraryItem): WireItem {
  const w: WireItem = { id: p.id, name: p.name, kind: p.kind, createdAt: p.createdAt };
  if (p.city !== null) w.city = p.city;
  if (p.country !== null) w.country = p.country;
  if (p.description !== null) w.description = p.description;
  if (p.notes !== null) w.notes = p.notes;
  if (p.vibes.length) w.vibes = p.vibes;
  if (p.bestTimeText !== null) w.bestTime = p.bestTimeText;
  if (p.recommendedBy !== null) w.recommendedBy = p.recommendedBy;
  if (p.visitStatus !== 'not_visited') w.visit = p.visitStatus;
  if (p.priority) w.priority = p.priority;
  if (p.ratingSelf) w.rating = p.ratingSelf;
  if (p.priceLevel !== null) w.price = p.priceLevel;
  if (p.lastVisited != null) w.lastVisited = p.lastVisited;
  if (p.plannedVisit != null) w.plannedVisit = p.plannedVisit;
  if (p.lat !== null) w.lat = p.lat;
  if (p.lon !== null) w.lon = p.lon;
  if (p.photos.length) w.photo = p.photos[0];
  const count = p.photoCount ?? p.photos.length;
  if (count > 1) w.photoCount = count;
  if (p.tags.length) w.tags = p.tags;
  if (p.address !== null) w.address = p.address;
  if (p.altNames.length) w.altNames = p.altNames;
  if (p.cuisine.length) w.cuisine = p.cuisine;
  if (p.activities.length) w.activities = p.activities;
  if (p.amenities.length) w.amenities = p.amenities;
  if (p.practicalInfo !== null) w.practicalInfo = p.practicalInfo;
  return w;
}

export function decodeItem(w: WireItem): LibraryItem {
  const lat = w.lat ?? null;
  const bestTimeText = w.bestTime ?? null;
  const item: LibraryItem = {
    id: w.id,
    name: w.name,
    kind: w.kind,
    city: w.city ?? null,
    country: w.country ?? null,
    description: w.description ?? null,
    notes: w.notes ?? null,
    vibes: w.vibes ?? [],
    bestTimeText,
    bestTime: parseBestTime(bestTimeText, lat),
    recommendedBy: w.recommendedBy ?? null,
    visitStatus: w.visit ?? 'not_visited',
    priority: w.priority ?? 0,
    ratingSelf: w.rating ?? 0,
    priceLevel: w.price ?? null,
    createdAt: w.createdAt,
    lastVisited: w.lastVisited ?? null,
    plannedVisit: w.plannedVisit ?? null,
    lat,
    lon: w.lon ?? null,
    photos: w.photo ? [w.photo] : [],
    tags: w.tags ?? [],
    address: w.address ?? null,
    altNames: w.altNames ?? [],
    cuisine: w.cuisine ?? [],
    activities: w.activities ?? [],
    amenities: w.amenities ?? [],
    practicalInfo: w.practicalInfo ?? null,
  };
  if (w.photoCount) item.photoCount = w.photoCount;
  return item;
}

export function encodeIndex(content: { version: string; items: LibraryItem[]; collections: ExploreCollection[] }): LibraryIndexWire {
  return {
    format: WIRE_FORMAT,
    version: content.version,
    items: content.items.map(encodeItem),
    collections: content.collections,
  };
}

/** Null for anything that is not an index of this format, so a stale or foreign body is never half-read. */
export function decodeIndex(body: unknown): LibraryIndexContent | null {
  if (!body || typeof body !== 'object') return null;
  const wire = body as Partial<LibraryIndexWire>;
  if (wire.format !== WIRE_FORMAT || typeof wire.version !== 'string') return null;
  if (!Array.isArray(wire.items) || !Array.isArray(wire.collections)) return null;
  return { version: wire.version, items: wire.items.map(decodeItem), collections: wire.collections };
}
