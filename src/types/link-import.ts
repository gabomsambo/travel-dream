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
  author?: string;
  placeName?: string;
  title?: string;
  thumbnailReference?: string;
}

export interface LinkProviderRecord {
  provider: string;
  status: 'ok' | 'empty' | 'error';
  details?: LinkDetails;
  cachedResponse?: Record<string, string | number | boolean | null>;
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
}
