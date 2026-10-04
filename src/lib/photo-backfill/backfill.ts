/**
 * One-off backfill: give every place of one user that shows no working photo a
 * real photo as its primary. See `scripts/backfill-place-photos.ts` for the CLI.
 *
 * Per place:
 *   - a primary photo that loads            → leave it alone
 *   - no working primary, but a working photo → make that photo primary (no API calls)
 *   - no working photo at all                → find one (Google, then Wikimedia),
 *                                             attach it like the Find-image dialog
 *                                             does, and make it primary
 * Nothing is ever deleted and no place field is written; the only change to an
 * existing row is clearing `is_primary` on the photo that stops being primary.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { attachments, places } from '@/db/schema';
import type { GooglePlaceWithPhotos } from '@/lib/photo-sources/google-places';
import { RateLimitError, type PhotoSearchItem } from '@/lib/photo-sources/types';
import { attachPhotoFromSource, setPrimaryPhoto, type PhotoFromSource } from '@/lib/place-photos';
import { forUser } from '@/lib/tenant-db';
import {
  judgeGoogleCandidate,
  judgeWikimediaItem,
  wikimediaAllowedFor,
  type BackfillPlace,
  type MatchVerdict,
} from './matching';

export type Liveness = 'live' | 'dead' | 'unknown';

export interface PhotoRow {
  id: string;
  source: string;
  uri: string;
  isPrimary: boolean;
}

export interface PlaceWithPhotos extends BackfillPlace {
  photos: PhotoRow[];
}

/** External calls, injected so tests can run the whole flow without a network. */
export interface BackfillDeps {
  fetchPlacePhotos(googlePlaceId: string): Promise<GooglePlaceWithPhotos>;
  searchPlacesWithPhotos(
    textQuery: string,
    near: { lat: number; lon: number } | null,
  ): Promise<GooglePlaceWithPhotos[]>;
  searchWikimedia(query: string): Promise<PhotoSearchItem[]>;
  /** HEAD a stored image URL: 2xx/3xx → live, 404/410 → dead, anything else → unknown. */
  checkUrl(url: string): Promise<Liveness>;
}

export interface MatchLogEntry extends MatchVerdict {
  via: 'stored-id' | 'text-search' | 'wikimedia';
  candidateId: string;
}

export type Decision =
  | { action: 'keep'; reason: string }
  | { action: 'repoint'; attachmentId: string; source: string }
  | {
      action: 'attach';
      photo: PhotoFromSource;
      match: MatchLogEntry;
      tried: MatchLogEntry[];
    }
  | { action: 'unmatched'; tried: MatchLogEntry[]; reason: string }
  | { action: 'retry-later'; reason: string };

/** Preference when choosing which already-attached working photo becomes primary. */
const SOURCE_RANK: Record<string, number> = {
  google_places: 0,
  wikimedia: 1,
  pexels: 2,
  upload: 3,
};

// ─── Loading ──────────────────────────────────────────────────────────────────

/** Every place the user owns, with its photo attachments. */
export async function loadUserPlaces(userId: string): Promise<PlaceWithPhotos[]> {
  const tdb = forUser(userId);
  const rows = await tdb.selectFields(places, {
    id: places.id,
    name: places.name,
    kind: places.kind,
    city: places.city,
    country: places.country,
    admin: places.admin,
    address: places.address,
    coords: places.coords,
    googlePlaceId: places.googlePlaceId,
    altNames: places.altNames,
  });

  const byPlace = new Map<string, PlaceWithPhotos>();
  for (const r of rows) {
    byPlace.set(r.id, { ...r, altNames: r.altNames ?? [], photos: [] });
  }

  const ids = [...byPlace.keys()];
  // Chunked to stay under SQLite's bound-parameter limit.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const photos = await tdb.selectFieldsVia(
      attachments,
      {
        id: attachments.id,
        placeId: attachments.placeId,
        source: attachments.source,
        uri: attachments.uri,
        isPrimary: attachments.isPrimary,
      },
      and(inArray(attachments.placeId, chunk), eq(attachments.type, 'photo')),
    );
    for (const p of photos) {
      byPlace.get(p.placeId)?.photos.push({
        id: p.id,
        source: p.source,
        uri: p.uri,
        isPrimary: p.isPrimary === 1,
      });
    }
  }

  return [...byPlace.values()];
}

// ─── Classification ───────────────────────────────────────────────────────────

/** Whether a stored photo currently renders. */
export async function photoLiveness(photo: PhotoRow, deps: BackfillDeps): Promise<Liveness> {
  // Rendered through the app's own resolver from a stored photo reference.
  if (photo.uri.startsWith('/api/photos/resolve/')) return 'live';
  if (/^https?:\/\//.test(photo.uri)) return deps.checkUrl(photo.uri);
  // Pre-Blob `/uploads/...` paths never existed on Vercel.
  return 'dead';
}

/**
 * What the place needs, before any search. `null` means it needs a new photo.
 */
export async function classifyPlace(
  place: PlaceWithPhotos,
  deps: BackfillDeps,
): Promise<Decision | null> {
  const states = await Promise.all(
    place.photos.map(async (photo) => ({ photo, state: await photoLiveness(photo, deps) })),
  );

  if (states.some((s) => s.photo.isPrimary && s.state === 'live')) {
    return { action: 'keep', reason: 'primary photo loads' };
  }

  const live = states
    .filter((s) => s.state === 'live')
    .sort((a, b) => (SOURCE_RANK[a.photo.source] ?? 9) - (SOURCE_RANK[b.photo.source] ?? 9));
  if (live.length > 0) {
    return { action: 'repoint', attachmentId: live[0].photo.id, source: live[0].photo.source };
  }

  if (states.some((s) => s.state === 'unknown')) {
    return { action: 'retry-later', reason: 'could not tell whether an existing photo loads' };
  }
  return null;
}

// ─── Finding a photo ──────────────────────────────────────────────────────────

function googleQuery(place: BackfillPlace): string {
  return [place.name, place.city, place.country]
    .filter((part, i, all): part is string => !!part && all.indexOf(part) === i)
    .join(', ');
}

function wikimediaQuery(place: BackfillPlace): string {
  const area = place.city && place.city !== place.name ? place.city : place.country;
  return [place.name, area].filter(Boolean).join(' ');
}

function asPhoto(item: PhotoSearchItem): PhotoFromSource {
  return {
    source: item.source,
    sourceId: item.sourceId,
    thumbnailUrl: item.thumbnailUrl,
    fullUrl: item.fullUrl,
    width: item.width,
    height: item.height,
    attribution: item.attribution,
    caption: item.caption,
  };
}

/**
 * Pick a photo for a place with none: the first photo of a confidently matched
 * Google place (its stored Google id first, then a text search), else a
 * confidently matched Wikimedia Commons file. Throws on upstream failure so the
 * caller can retry — an outage is never recorded as "no match".
 */
export async function findPhoto(place: BackfillPlace, deps: BackfillDeps): Promise<Decision> {
  const tried: MatchLogEntry[] = [];
  const seen = new Set<string>();

  const tryGoogle = (
    candidate: GooglePlaceWithPhotos,
    via: MatchLogEntry['via'],
  ): Decision | null => {
    if (seen.has(candidate.googlePlaceId)) return null;
    seen.add(candidate.googlePlaceId);
    const verdict = judgeGoogleCandidate(place, candidate);
    const entry: MatchLogEntry = { ...verdict, via, candidateId: candidate.googlePlaceId };
    if (verdict.accepted && candidate.photos.length === 0) {
      entry.accepted = false;
      entry.reason = `${verdict.reason}; but Google has no photos`;
    }
    tried.push(entry);
    if (!entry.accepted) return null;
    return { action: 'attach', photo: asPhoto(candidate.photos[0]), match: entry, tried };
  };

  if (place.googlePlaceId) {
    let stored: GooglePlaceWithPhotos | null = null;
    try {
      stored = await deps.fetchPlacePhotos(place.googlePlaceId);
    } catch (error) {
      // A stale or invalid stored id is a verdict about the id, not an outage.
      const status = (error as { status?: unknown })?.status;
      if (status !== 400 && status !== 404) throw error;
      tried.push({
        accepted: false,
        matchedName: '',
        similarity: 0,
        distanceKm: null,
        reason: `stored Google id rejected (${status})`,
        via: 'stored-id',
        candidateId: place.googlePlaceId,
      });
    }
    const found = stored ? tryGoogle(stored, 'stored-id') : null;
    if (found) return found;
  }

  if (place.coords || place.city || place.country) {
    const candidates = await deps.searchPlacesWithPhotos(googleQuery(place), place.coords);
    // Google's own ranking decides among candidates that pass the bar.
    for (const candidate of candidates) {
      const found = tryGoogle(candidate, 'text-search');
      if (found) return found;
    }
  }

  if (wikimediaAllowedFor(place.kind)) {
    const items = await deps.searchWikimedia(wikimediaQuery(place));
    for (const item of items) {
      const verdict = judgeWikimediaItem(place, item);
      const entry: MatchLogEntry = { ...verdict, via: 'wikimedia', candidateId: item.sourceId };
      tried.push(entry);
      if (verdict.accepted) return { action: 'attach', photo: asPhoto(item), match: entry, tried };
    }
  }

  const reason = !place.coords && !place.city && !place.country
    ? 'place has no location to verify a match against'
    : tried.length === 0
      ? 'no candidates found'
      : 'no confident match';
  return { action: 'unmatched', tried, reason };
}

/** Full decision for one place: classification, then a search when it needs a photo. */
export async function planPlace(place: PlaceWithPhotos, deps: BackfillDeps): Promise<Decision> {
  return (await classifyPlace(place, deps)) ?? findPhoto(place, deps);
}

// ─── Applying ─────────────────────────────────────────────────────────────────

export type ApplyOutcome =
  | { applied: 'attached'; attachmentId: string; deduped: boolean }
  | { applied: 'repointed'; attachmentId: string }
  | { applied: 'none' };

/**
 * Write one decision. Safe to repeat: attaching is deduped per (place, source,
 * sourceId), and making the same photo primary twice is a no-op.
 */
export async function applyDecision(
  userId: string,
  placeId: string,
  decision: Decision,
): Promise<ApplyOutcome> {
  if (decision.action === 'repoint') {
    const ok = await setPrimaryPhoto(userId, placeId, decision.attachmentId);
    if (!ok) throw new Error(`attachment ${decision.attachmentId} not found on ${placeId}`);
    return { applied: 'repointed', attachmentId: decision.attachmentId };
  }
  if (decision.action === 'attach') {
    const result = await attachPhotoFromSource(userId, placeId, decision.photo, 'always');
    if (!result.ok) throw new Error(`attach failed (${result.status}): ${result.error}`);
    if (result.deduped && result.attachment.isPrimary !== 1) {
      // A previous run attached it but stopped before promoting it.
      await setPrimaryPhoto(userId, placeId, result.attachment.id);
    }
    return { applied: 'attached', attachmentId: result.attachment.id, deduped: result.deduped };
  }
  return { applied: 'none' };
}

// ─── Retry ────────────────────────────────────────────────────────────────────

/** True for failures that say nothing about the place: rate limits, 5xx, network. */
export function isTransient(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  const status = (error as { status?: unknown })?.status;
  if (typeof status === 'number') return status === 429 || status >= 500;
  if (error instanceof TypeError) return true; // fetch network failure
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|5\d\d)\b|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed/i.test(
    message,
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 6;
  const baseMs = opts.baseMs ?? 1000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !isTransient(error)) throw error;
      const backoff = baseMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5);
      const floor = error instanceof RateLimitError ? error.retryAfterSec * 1000 : 0;
      await sleep(Math.max(backoff, floor));
    }
  }
}

/** Minimum spacing between calls to one upstream, shared by every lane. */
export function throttle(minIntervalMs: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let next = 0;
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + minIntervalMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
    return fn();
  };
}
