import 'server-only';
import { Redis } from '@upstash/redis';

const PLACES_BASE = 'https://places.googleapis.com/v1/';
const MEDIA_BASE = 'https://places.googleapis.com/v1/';
const CACHE_TTL_SEC = 3000; // 50 min — under Google's ~60 min photoUri validity
// `photos` alone is Place Details "Essentials (IDs Only)": free and unlimited.
const REFRESH_FIELD_MASK = 'photos';

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    redis = new Redis({ url, token });
    return redis;
  } catch {
    return null;
  }
}

interface GoogleAuthorAttribution {
  displayName: string;
  uri: string;
  photoUri?: string;
}

/** A replacement for an expired photo name, to be stored back on the attachment. */
export interface RefreshedGooglePhoto {
  name: string;
  widthPx: number | null;
  heightPx: number | null;
  authorAttributions: GoogleAuthorAttribution[];
}

export interface ResolvedGooglePhoto {
  photoUri: string;
  /** Set only when the stored name had expired and was replaced. */
  refreshed?: RefreshedGooglePhoto;
}

type MediaResult = { photoUri: string } | { expired: true } | { failed: true };

async function fetchMedia(photoName: string, maxWidthPx: number, apiKey: string): Promise<MediaResult> {
  const url = `${MEDIA_BASE}${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': apiKey },
    });
    // Google answers 400 for a photo name that has expired (it also covers a
    // malformed name, which a refresh cannot make worse).
    if (res.status === 400) return { expired: true };
    if (!res.ok) return { failed: true };
    const body = (await res.json()) as { photoUri?: string };
    return body.photoUri ? { photoUri: body.photoUri } : { failed: true };
  } catch {
    return { failed: true };
  }
}

/**
 * Fresh photo names for the place an expired name belonged to. The place id is
 * the one part of a photo name Google lets us keep indefinitely.
 */
async function refreshPhoto(
  expiredName: string,
  apiKey: string,
  preferredAuthorUri?: string,
): Promise<RefreshedGooglePhoto | null> {
  const placeId = /^places\/([^/]+)\/photos\//.exec(expiredName)?.[1];
  if (!placeId) return null;
  try {
    const res = await fetch(`${PLACES_BASE}places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': REFRESH_FIELD_MASK },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      photos?: Array<{
        name: string;
        widthPx?: number;
        heightPx?: number;
        authorAttributions?: GoogleAuthorAttribution[];
      }>;
    };
    const photos = body.photos ?? [];
    // The same contributor's photo is most likely the one that was picked;
    // otherwise fall back to the place's first photo, as the backfill chose.
    const photo =
      (preferredAuthorUri &&
        photos.find((p) => p.authorAttributions?.some((a) => a.uri === preferredAuthorUri))) ||
      photos[0];
    if (!photo) return null;
    return {
      name: photo.name,
      widthPx: photo.widthPx ?? null,
      heightPx: photo.heightPx ?? null,
      authorAttributions: photo.authorAttributions ?? [],
    };
  } catch {
    return null;
  }
}

// Google says a photo name cannot be cached and can expire. The stored name is
// therefore only a hint: when Google rejects it, a free IDs-only Place Details
// call gets a fresh name for the same place, and the caller stores that back.
export async function resolveGooglePhoto(
  photoName: string,
  maxWidthPx: number = 1200,
  preferredAuthorUri?: string,
): Promise<ResolvedGooglePhoto | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const cache = getRedis();
  const key = `gphoto:${photoName}:${maxWidthPx}`;

  if (cache) {
    try {
      const cached = await cache.get<string>(key);
      if (cached) return { photoUri: cached };
    } catch {
      // fall through to fresh fetch
    }
  }

  const media = await fetchMedia(photoName, maxWidthPx, apiKey);
  let photoUri: string;
  let refreshed: RefreshedGooglePhoto | undefined;

  if ('photoUri' in media) {
    photoUri = media.photoUri;
  } else if ('expired' in media) {
    const fresh = await refreshPhoto(photoName, apiKey, preferredAuthorUri);
    if (!fresh) return null;
    const retry = await fetchMedia(fresh.name, maxWidthPx, apiKey);
    if (!('photoUri' in retry)) return null;
    photoUri = retry.photoUri;
    refreshed = fresh;
  } else {
    return null;
  }

  if (cache) {
    try {
      const cacheKey = refreshed ? `gphoto:${refreshed.name}:${maxWidthPx}` : key;
      await cache.set(cacheKey, photoUri, { ex: CACHE_TTL_SEC });
    } catch {
      // best-effort; ignore cache write errors
    }
  }

  return refreshed ? { photoUri, refreshed } : { photoUri };
}
