/**
 * Edits to the Library's index as the browser applies them: an archive, a status
 * change, a new place or photo changes what the page shows without waiting for
 * the library to be fetched again.
 *
 * A patch is a statement of the result, not of the step ("these places are
 * gone", "this place's cover is X, it has 3 photos"), so applying one twice, or
 * over an index that already holds the change, gives the same index. The store
 * relies on that: it keeps patches on top of the last index it fetched until a
 * fetch that started after the server took the edit replaces them.
 *
 * Pure and client-safe, like `wire.ts`.
 */
import { parseBestTime } from '@/lib/explore/best-time';
import type { ExploreCollection, ExplorePhoto } from '@/lib/explore/types';
import { usablePin } from '@/lib/place-coords';
import type { Attachment } from '@/lib/place-photos';
import type { Place } from '@/types/database';
import type { LibraryItem } from './types';
import type { LibraryIndexContent } from './wire';

export type VisitStatus = LibraryItem['visitStatus'];

export type IndexPatch =
  /** Places leave the library (archived, deleted). `purge` also drops them from every collection, as a delete does. */
  | { kind: 'remove'; ids: string[]; purge?: boolean }
  /** Places join the library, or are replaced by these copies (restored, added). */
  | { kind: 'upsert'; items: LibraryItem[] }
  | { kind: 'visit'; ids: string[]; status: VisitStatus }
  /** A place's cover and how many photos it has. `photo` is absent when the cover did not change. */
  | { kind: 'cover'; id: string; photo?: ExplorePhoto; count: number }
  | { kind: 'members'; id: string; add?: string[]; remove?: string[] }
  | { kind: 'collection'; collection: ExploreCollection };

type Content = Pick<LibraryIndexContent, 'items' | 'collections'>;

function mapItems(items: LibraryItem[], change: (p: LibraryItem) => LibraryItem): LibraryItem[] {
  let changed = false;
  const next = items.map((p) => {
    const q = change(p);
    if (q !== p) changed = true;
    return q;
  });
  return changed ? next : items;
}

function mapCollections(collections: ExploreCollection[], change: (c: ExploreCollection) => ExploreCollection): ExploreCollection[] {
  let changed = false;
  const next = collections.map((c) => {
    const d = change(c);
    if (d !== c) changed = true;
    return d;
  });
  return changed ? next : collections;
}

/** `content` itself when the patch changes nothing, so callers can tell by identity. */
export function applyPatch<T extends Content>(content: T, patch: IndexPatch): T {
  const { items, collections } = content;
  switch (patch.kind) {
    case 'remove': {
      const gone = new Set(patch.ids);
      const nextItems = items.filter((p) => !gone.has(p.id));
      const nextCollections = patch.purge
        ? mapCollections(collections, (c) => (c.placeIds.some((id) => gone.has(id)) ? { ...c, placeIds: c.placeIds.filter((id) => !gone.has(id)) } : c))
        : collections;
      if (nextItems.length === items.length && nextCollections === collections) return content;
      return { ...content, items: nextItems.length === items.length ? items : nextItems, collections: nextCollections };
    }
    case 'upsert': {
      const incoming = new Map(patch.items.map((p) => [p.id, p]));
      const seen = new Set<string>();
      let nextItems = mapItems(items, (p) => {
        const q = incoming.get(p.id);
        if (!q) return p;
        seen.add(p.id);
        return q;
      });
      const fresh = patch.items.filter((p) => !seen.has(p.id));
      if (fresh.length) nextItems = [...nextItems, ...fresh];
      return nextItems === items ? content : { ...content, items: nextItems };
    }
    case 'visit': {
      const ids = new Set(patch.ids);
      const nextItems = mapItems(items, (p) => (ids.has(p.id) && p.visitStatus !== patch.status ? { ...p, visitStatus: patch.status } : p));
      return nextItems === items ? content : { ...content, items: nextItems };
    }
    case 'cover': {
      const nextItems = mapItems(items, (p) => {
        if (p.id !== patch.id) return p;
        const photos = patch.photo && !(p.photos.length === 1 && sameValue(p.photos[0], patch.photo)) ? [patch.photo] : p.photos;
        const count = patch.count > photos.length ? patch.count : undefined;
        if (photos === p.photos && p.photoCount === count) return p;
        const { photoCount: _drop, ...rest } = p;
        return count === undefined ? { ...rest, photos } : { ...rest, photos, photoCount: count };
      });
      return nextItems === items ? content : { ...content, items: nextItems };
    }
    case 'members': {
      const add = patch.add ?? [];
      const remove = new Set(patch.remove ?? []);
      const nextCollections = mapCollections(collections, (c) => {
        if (c.id !== patch.id) return c;
        const have = new Set(c.placeIds);
        const fresh = add.filter((id) => !have.has(id));
        if (!fresh.length && !c.placeIds.some((id) => remove.has(id))) return c;
        return { ...c, placeIds: [...c.placeIds.filter((id) => !remove.has(id)), ...fresh] };
      });
      return nextCollections === collections ? content : { ...content, collections: nextCollections };
    }
    case 'collection': {
      const known = collections.find((c) => c.id === patch.collection.id);
      if (known && sameValue(known, patch.collection)) return content;
      const nextCollections = known ? collections.map((c) => (c === known ? patch.collection : c)) : [...collections, patch.collection];
      return { ...content, collections: nextCollections };
    }
  }
}

/** Plain JSON-shaped values, which is all an index holds. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameValue(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => k in b && sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * `next` made out of `prev`'s objects wherever they hold the same data, and
 * `prev` itself when the whole content is the same. The page memoizes on the
 * identity of `items`, so a fetch that confirms what the browser already shows
 * costs no render, and one that changes a few places re-renders only those.
 */
export function shareStructure<T extends Content>(prev: T, next: T): T {
  const old = new Map(prev.items.map((p) => [p.id, p]));
  const items = next.items.map((p) => {
    const was = old.get(p.id);
    return was && sameValue(was, p) ? was : p;
  });
  const sameItems = items.length === prev.items.length && items.every((p, i) => p === prev.items[i]);
  const collections = sameValue(prev.collections, next.collections) ? prev.collections : next.collections;
  if (sameItems && collections === prev.collections) return prev;
  return { ...next, items: sameItems ? prev.items : items, collections };
}

/** A photo as the index carries it. Mirrors `toExplorePhotos` on the server: both sizes travel, a missing thumbnail falls back to the full image. */
export function photoOfAttachment(a: Pick<Attachment, 'uri' | 'thumbnailUri' | 'attribution' | 'source'>): ExplorePhoto | null {
  // Pre-Blob /uploads/ rows never existed on Vercel (AGENTS.md § File Storage).
  if (a.uri.startsWith('/uploads/')) return null;
  return { uri: a.uri, thumb: a.thumbnailUri || a.uri, attribution: a.attribution ?? null, source: a.source };
}

/**
 * What attaching `attachment` to `item` does to the index: one more photo, and
 * the cover when the new one became primary or the place had none. Null when
 * the photo was already attached.
 */
export function coverPatchAfterAttach(
  item: Pick<LibraryItem, 'id' | 'photos' | 'photoCount'>,
  attachment: Pick<Attachment, 'uri' | 'thumbnailUri' | 'attribution' | 'source' | 'isPrimary'>,
  deduped: boolean
): IndexPatch | null {
  if (deduped) return null;
  const photo = photoOfAttachment(attachment);
  if (!photo) return null;
  const cover = attachment.isPrimary || item.photos.length === 0 ? photo : undefined;
  return { kind: 'cover', id: item.id, photo: cover, count: (item.photoCount ?? item.photos.length) + 1 };
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * A library place as `loadLibraryContent` would build it from a freshly created
 * row: no photos yet, nothing visited, in no collection.
 */
export function itemOfPlace(p: Place): LibraryItem {
  const pin = usablePin(p.coords && typeof p.coords === 'object' ? p.coords : null);
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    city: p.city ?? null,
    country: p.country ?? null,
    description: p.description ?? null,
    notes: p.notes ?? null,
    vibes: asStrings(p.vibes),
    bestTimeText: p.best_time ?? null,
    bestTime: parseBestTime(p.best_time ?? null, pin?.lat),
    recommendedBy: p.recommendedBy ?? null,
    visitStatus: p.visitStatus === 'visited' || p.visitStatus === 'planned' ? p.visitStatus : 'not_visited',
    priority: p.priority ?? 0,
    ratingSelf: p.ratingSelf ?? 0,
    priceLevel: p.price_level ?? null,
    createdAt: p.createdAt,
    lastVisited: p.lastVisited ?? null,
    plannedVisit: p.plannedVisit ?? null,
    lat: pin?.lat ?? null,
    lon: pin?.lon ?? null,
    photos: [],
    tags: asStrings(p.tags),
    address: p.address ?? null,
    altNames: asStrings(p.altNames),
    cuisine: asStrings(p.cuisine),
    activities: asStrings(p.activities),
    amenities: asStrings(p.amenities),
    practicalInfo: p.practicalInfo ?? null,
  };
}
