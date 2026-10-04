import type {
  PhotoSearchInput,
  PhotoSearchItem,
  PhotoSearchResult,
  PhotoSourceAdapter,
} from './types';
import { ConfigError, RateLimitError } from './types';

const PLACES_BASE = 'https://places.googleapis.com/v1/places/';
const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const MEDIA_BASE = 'https://places.googleapis.com/v1/';
// `displayName` makes this Place Details Pro; `location` and `types` ride along on the same SKU.
const FIELD_MASK = 'id,displayName,photos';
const FIELD_MASK_WITH_LOCATION = 'id,displayName,location,types,photos';
// Text Search Pro: every field here is Pro or cheaper, none is Enterprise.
const TEXT_SEARCH_FIELD_MASK =
  'places.id,places.displayName,places.location,places.formattedAddress,places.types,places.photos';
const THUMB_WIDTH = 400;

interface GoogleAuthorAttribution {
  displayName: string;
  uri: string;
  photoUri?: string;
}

interface GooglePhoto {
  name: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: GoogleAuthorAttribution[];
}

interface GooglePlaceDetailsResponse {
  id: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  types?: string[];
  photos?: GooglePhoto[];
}

/** A Google place with its photos as attachable items (thumbnails unresolved). */
export interface GooglePlaceWithPhotos {
  googlePlaceId: string;
  displayName: string | null;
  location: { lat: number; lon: number } | null;
  formattedAddress: string | null;
  types: string[];
  photos: PhotoSearchItem[];
}

/** A non-2xx answer from Google, kept with its status so callers can tell a retry from a verdict. */
export class GooglePlacesApiError extends Error {
  constructor(public status: number, statusText: string) {
    super(`Google Places request failed: ${status} ${statusText}`);
    this.name = 'GooglePlacesApiError';
  }
}

function requireApiKey(): string {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new ConfigError('GOOGLE_PLACES_API_KEY');
  }
  return apiKey;
}

async function failFor(res: Response): Promise<never> {
  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After') ?? 5);
    throw new RateLimitError(Number.isFinite(retry) && retry > 0 ? retry : 5);
  }
  throw new GooglePlacesApiError(res.status, res.statusText);
}

function toPhotoItem(photo: GooglePhoto, thumb: string | null = null): PhotoSearchItem {
  return {
    source: 'google_places',
    sourceId: photo.name,
    thumbnailUrl: thumb,
    fullUrl: thumb,
    width: photo.widthPx ?? null,
    height: photo.heightPx ?? null,
    attribution: {
      kind: 'google_places',
      authorAttributions: photo.authorAttributions ?? [],
    },
  };
}

function toPlaceWithPhotos(data: GooglePlaceDetailsResponse): GooglePlaceWithPhotos {
  const lat = data.location?.latitude;
  const lon = data.location?.longitude;
  return {
    googlePlaceId: data.id,
    displayName: data.displayName?.text ?? null,
    location:
      typeof lat === 'number' && typeof lon === 'number' ? { lat, lon } : null,
    formattedAddress: data.formattedAddress ?? null,
    types: data.types ?? [],
    photos: (data.photos ?? []).map((photo) => toPhotoItem(photo)),
  };
}

async function resolveThumb(
  photoName: string,
  apiKey: string,
  maxWidthPx: number = THUMB_WIDTH,
): Promise<string | null> {
  const url = `${MEDIA_BASE}${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': apiKey },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { photoUri?: string };
    return body.photoUri ?? null;
  } catch {
    return null;
  }
}

/**
 * One Place Photos call, uncached: the short-lived `photoUri` for a photo name.
 * Billed per call, so only for previews outside the app (the app's resolver caches).
 */
export async function resolvePhotoPreviewUri(
  photoName: string,
  maxWidthPx: number = THUMB_WIDTH,
): Promise<string | null> {
  return resolveThumb(photoName, requireApiKey(), maxWidthPx);
}

/**
 * Place Details for one place: its name, location and photo references, with no
 * Place Photos calls. Each photo is shaped exactly as `search` returns it, minus
 * the resolved thumbnail, so it can go straight to `attachPhotoFromSource`.
 */
export async function fetchPlacePhotos(googlePlaceId: string): Promise<GooglePlaceWithPhotos> {
  const apiKey = requireApiKey();
  const url = `${PLACES_BASE}${encodeURIComponent(googlePlaceId)}?languageCode=en`;
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK_WITH_LOCATION,
    },
  });
  if (!res.ok) await failFor(res);
  return toPlaceWithPhotos((await res.json()) as GooglePlaceDetailsResponse);
}

/** Text Search (New) candidates for a free-text query, biased toward `near` when given. */
export async function searchPlacesWithPhotos(
  textQuery: string,
  near?: { lat: number; lon: number } | null,
  maxResults = 5,
): Promise<GooglePlaceWithPhotos[]> {
  const apiKey = requireApiKey();
  const body: Record<string, unknown> = { textQuery, pageSize: maxResults, languageCode: 'en' };
  if (near) {
    body.locationBias = {
      circle: { center: { latitude: near.lat, longitude: near.lon }, radius: 50_000 },
    };
  }
  const res = await fetch(TEXT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': TEXT_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await failFor(res);
  const data = (await res.json()) as { places?: GooglePlaceDetailsResponse[] };
  return (data.places ?? []).map(toPlaceWithPhotos);
}

async function search(input: PhotoSearchInput): Promise<PhotoSearchResult> {
  const apiKey = requireApiKey();
  if (!input.googlePlaceId) {
    throw new Error('googlePlaceId is required for google_places source');
  }

  const detailsUrl = `${PLACES_BASE}${encodeURIComponent(input.googlePlaceId)}`;
  const res = await fetch(detailsUrl, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
  });
  if (!res.ok) {
    throw new Error(`Google Places request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GooglePlaceDetailsResponse;
  const photos = data.photos ?? [];

  const thumbs = await Promise.all(
    photos.map((photo) => resolveThumb(photo.name, apiKey)),
  );

  const items: PhotoSearchItem[] = photos.map((photo, i) => toPhotoItem(photo, thumbs[i]));

  return { items, nextPage: null };
}

const adapter: PhotoSourceAdapter = {
  source: 'google_places',
  search,
};

export default adapter;
