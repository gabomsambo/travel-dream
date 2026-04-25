import type {
  PhotoSearchInput,
  PhotoSearchItem,
  PhotoSearchResult,
  PhotoSourceAdapter,
} from './types';
import { ConfigError, RateLimitError } from './types';

const ENDPOINT = 'https://api.pexels.com/v1/search';
const PAGE_SIZE = 12;

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt?: string | null;
  src: {
    medium?: string;
    large?: string;
    large2x?: string;
    original?: string;
  };
}

interface PexelsResponse {
  photos: PexelsPhoto[];
  next_page?: string | null;
}

async function search(input: PhotoSearchInput): Promise<PhotoSearchResult> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new ConfigError('PEXELS_API_KEY');
  }

  const page = input.page ?? 1;
  const params = new URLSearchParams({
    query: input.query,
    per_page: String(PAGE_SIZE),
    page: String(page),
    orientation: 'landscape',
  });

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: {
      Authorization: apiKey,
    },
  });

  if (res.status === 429) {
    const resetUnix = Number(res.headers.get('x-ratelimit-reset') ?? 0);
    const waitMs = Math.max(0, resetUnix * 1000 - Date.now());
    const retryAfterSec = Math.max(1, Math.ceil(waitMs / 1000));
    throw new RateLimitError(retryAfterSec);
  }
  if (!res.ok) {
    throw new Error(`Pexels request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as PexelsResponse;

  const items: PhotoSearchItem[] = (data.photos ?? []).map((photo) => ({
    source: 'pexels' as const,
    sourceId: String(photo.id),
    thumbnailUrl: photo.src.medium ?? photo.src.large ?? null,
    fullUrl: photo.src.large2x ?? photo.src.large ?? photo.src.original ?? null,
    width: photo.width,
    height: photo.height,
    attribution: {
      kind: 'pexels',
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      photoUrl: photo.url,
    },
    caption: photo.alt ?? undefined,
  }));

  return {
    items,
    nextPage: data.next_page ? page + 1 : null,
  };
}

const adapter: PhotoSourceAdapter = {
  source: 'pexels',
  search,
};

export default adapter;
