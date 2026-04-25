import type { AttributionMeta } from '@/db/schema/attachments';

export type PhotoSource = 'google_places' | 'wikimedia' | 'pexels';

export const PHOTO_SOURCES: PhotoSource[] = ['google_places', 'wikimedia', 'pexels'];

export interface PhotoSearchItem {
  source: PhotoSource;
  sourceId: string;
  thumbnailUrl: string | null;
  fullUrl: string | null;
  width: number | null;
  height: number | null;
  attribution: AttributionMeta;
  caption?: string;
}

export interface PhotoSearchInput {
  query: string;
  placeId: string;
  page?: number;
  googlePlaceId?: string;
}

export interface PhotoSearchResult {
  items: PhotoSearchItem[];
  nextPage: number | null;
}

export interface PhotoSourceAdapter {
  source: PhotoSource;
  search(input: PhotoSearchInput): Promise<PhotoSearchResult>;
}

export class ConfigError extends Error {
  constructor(public missingEnv: string) {
    super(`${missingEnv} not configured`);
    this.name = 'ConfigError';
  }
}

export class RateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    super(`Rate limited; retry after ${retryAfterSec}s`);
    this.name = 'RateLimitError';
  }
}
