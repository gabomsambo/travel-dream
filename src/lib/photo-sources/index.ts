import type { PhotoSource, PhotoSourceAdapter } from './types';
import googlePlaces from './google-places';
import wikimedia from './wikimedia';
import pexels from './pexels';

export function getAdapter(source: PhotoSource): PhotoSourceAdapter {
  switch (source) {
    case 'google_places':
      return googlePlaces;
    case 'wikimedia':
      return wikimedia;
    case 'pexels':
      return pexels;
    default: {
      const _exhaustive: never = source;
      throw new Error(`Unknown photo source: ${_exhaustive}`);
    }
  }
}

export type { PhotoSource, PhotoSourceAdapter, PhotoSearchItem, PhotoSearchInput, PhotoSearchResult } from './types';
export { ConfigError, RateLimitError, PHOTO_SOURCES } from './types';
