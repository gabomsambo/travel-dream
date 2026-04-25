import 'server-only';
import { Redis } from '@upstash/redis';

const MEDIA_BASE = 'https://places.googleapis.com/v1/';
const CACHE_TTL_SEC = 3000; // 50 min — under Google's ~60 min photoUri validity

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

// TODO: place_id is the only Google Maps Content allowed to be cached indefinitely.
// Photo resource names that are >12 months old should be refreshed via a free
// `id`-only Place Details call. Out of scope for this PRP.
export async function resolveGooglePhotoUri(
  photoName: string,
  maxWidthPx: number = 1200,
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const cache = getRedis();
  const key = `gphoto:${photoName}:${maxWidthPx}`;

  if (cache) {
    try {
      const cached = await cache.get<string>(key);
      if (cached) return cached;
    } catch {
      // fall through to fresh fetch
    }
  }

  const url = `${MEDIA_BASE}${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
  let body: { photoUri?: string };
  try {
    const res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': apiKey },
    });
    if (!res.ok) return null;
    body = (await res.json()) as { photoUri?: string };
  } catch {
    return null;
  }

  const photoUri = body.photoUri;
  if (!photoUri) return null;

  if (cache) {
    try {
      await cache.set(key, photoUri, { ex: CACHE_TTL_SEC });
    } catch {
      // best-effort; ignore cache write errors
    }
  }

  return photoUri;
}
