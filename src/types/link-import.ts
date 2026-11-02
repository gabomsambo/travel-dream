export type LinkPlatform = 'tiktok' | 'instagram';

export type LinkKind =
  | 'tiktok-video'
  | 'tiktok-photo'
  | 'tiktok-place'
  | 'tiktok-short'
  | 'instagram-post'
  | 'instagram-reel';

export interface CanonicalSocialLink {
  platform: LinkPlatform;
  kind: LinkKind;
  originalUrl: string;
  canonicalUrl: string;
  handle?: string;
  postId?: string;
  placeName?: string;
  placeId?: string;
  needsResolution: boolean;
}

export type LinkParseResult =
  | { supported: true; link: CanonicalSocialLink }
  | { supported: false; reason: string };

export interface LinkDetails {
  caption?: string;
  hashtags?: string[];
  author?: string;
  authorHandle?: string;
  placeName?: string;
  placeAddress?: string;
  placeCategory?: string;
  placeCity?: string;
  placeSourceId?: string;
  title?: string;
  thumbnailReference?: string;
  postedAt?: number;
  contentKind?: 'photo' | 'video';
  sourceUrl?: string;
}

export type LinkProviderReason =
  | 'disabled'
  | 'gone'
  | 'unavailable'
  | 'blocked'
  | 'format_changed'
  | 'transient'
  | 'throttled'
  | 'safety_unavailable';

/** Signed TikTok CDN URLs are transient and must never enter persisted details. */
export interface TikTokImageRef {
  url: string;
  width?: number;
  height?: number;
  expiresAt?: number;
}

export interface LinkProviderResult {
  details?: LinkDetails;
  cachedResponse?: Record<string, string | number | boolean | null>;
  empty?: boolean;
  reason?: LinkProviderReason;
  /** In-memory only. `details` and provider history remain safe to persist. */
  transient?: { imageRefs?: TikTokImageRef[] };
}

export interface LinkProviderContext {
  userId?: string;
  forceRefresh?: boolean;
}

export interface LinkProviderRecord {
  provider: string;
  status: 'ok' | 'empty' | 'error';
  details?: LinkDetails;
  cachedResponse?: Record<string, string | number | boolean | null>;
  reason?: LinkProviderReason;
  error?: string;
  fetchedAt: string;
}

export interface LinkResolution {
  status: 'not-needed' | 'resolved' | 'unresolved';
  error?: 'fetch-failed' | 'invalid-redirect' | 'hop-limit' | 'not-canonical';
}

export interface LinkSourceMeta {
  originalUrl: string;
  canonicalUrl: string;
  aliasUrls?: string[];
  platform: LinkPlatform;
  kind: LinkKind;
  handle?: string;
  postId?: string;
  placeName?: string;
  placeId?: string;
  needsResolution: boolean;
  resolution: LinkResolution;
  captionText?: string;
  details?: LinkDetails;
  providers: LinkProviderRecord[];
  tiktokPhotoImport?: {
    status: 'importing' | 'imported' | 'failed';
    requestedAt?: string;
    sourceIds?: string[];
    count?: number;
  };
}
