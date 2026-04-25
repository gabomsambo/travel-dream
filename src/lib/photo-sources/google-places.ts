import type {
  PhotoSearchInput,
  PhotoSearchItem,
  PhotoSearchResult,
  PhotoSourceAdapter,
} from './types';
import { ConfigError } from './types';

const PLACES_BASE = 'https://places.googleapis.com/v1/places/';
const MEDIA_BASE = 'https://places.googleapis.com/v1/';
const FIELD_MASK = 'id,displayName,photos';
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
  photos?: GooglePhoto[];
}

async function resolveThumb(
  photoName: string,
  apiKey: string,
): Promise<string | null> {
  const url = `${MEDIA_BASE}${photoName}/media?maxWidthPx=${THUMB_WIDTH}&skipHttpRedirect=true`;
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

async function search(input: PhotoSearchInput): Promise<PhotoSearchResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new ConfigError('GOOGLE_PLACES_API_KEY');
  }
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

  const items: PhotoSearchItem[] = photos.map((photo, i) => ({
    source: 'google_places',
    sourceId: photo.name,
    thumbnailUrl: thumbs[i],
    fullUrl: thumbs[i],
    width: photo.widthPx ?? null,
    height: photo.heightPx ?? null,
    attribution: {
      kind: 'google_places',
      authorAttributions: photo.authorAttributions ?? [],
    },
  }));

  return { items, nextPage: null };
}

const adapter: PhotoSourceAdapter = {
  source: 'google_places',
  search,
};

export default adapter;
