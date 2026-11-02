import type { CanonicalSocialLink, LinkParseResult } from '@/types/link-import';

const TIKTOK_SHORT_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);
const TIKTOK_CONTENT_HOSTS = new Set(['tiktok.com', 'www.tiktok.com']);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const TRACKING_KEYS = new Set(['_r', '_t', '_d', 'checksum', '_svg', 'igsh']);

function normalizePlaceName(value: string): string | undefined {
  const name = value.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 120 || !/[\p{L}\p{N}]/u.test(name)) return undefined;
  return name;
}

function decodePathPart(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.includes('/') || decoded.includes('\\') ? undefined : decoded;
  } catch {
    return undefined;
  }
}

function stripTrackingParams(url: URL): void {
  const toDelete: string[] = [];
  url.searchParams.forEach((_value, key) => {
    const normalizedKey = key.toLowerCase();
    if (TRACKING_KEYS.has(normalizedKey) || normalizedKey.startsWith('utm_')) {
      toDelete.push(key);
    }
  });
  for (const key of toDelete) url.searchParams.delete(key);
}

function sanitizeInputUrl(input: string): URL | null {
  const trimmed = input.trim().replace(/^<|>$/g, '');
  if (!trimmed || trimmed.length > 2048) return null;

  try {
    const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password || url.port) return null;
    url.protocol = 'https:';
    url.hash = '';
    stripTrackingParams(url);
    return url;
  } catch {
    return null;
  }
}

function unsupported(reason: string): LinkParseResult {
  return { supported: false, reason };
}

function canonicalLink(
  platform: CanonicalSocialLink['platform'],
  kind: CanonicalSocialLink['kind'],
  originalUrl: string,
  canonicalUrl: string,
  fields: Omit<CanonicalSocialLink, 'platform' | 'kind' | 'originalUrl' | 'canonicalUrl' | 'needsResolution'> = {},
): LinkParseResult {
  return {
    supported: true,
    link: {
      platform,
      kind,
      originalUrl,
      canonicalUrl,
      ...fields,
      needsResolution: kind === 'tiktok-short',
    },
  };
}

function parseTikTok(url: URL, originalUrl: string): LinkParseResult {
  const hostname = url.hostname.toLowerCase();
  if (!TIKTOK_SHORT_HOSTS.has(hostname)) return unsupported('Unsupported host');

  const segments = url.pathname.split('/').filter(Boolean);
  const first = segments[0]?.toLowerCase();

  if ((hostname === 'vm.tiktok.com' || hostname === 'vt.tiktok.com') && segments.length === 1) {
    const code = decodePathPart(segments[0]);
    if (!code || !/^[A-Za-z0-9_-]{4,64}$/.test(code)) return unsupported('Malformed TikTok short link');
    return canonicalLink('tiktok', 'tiktok-short', originalUrl, `${url.origin}/${encodeURIComponent(code)}`);
  }

  if (!TIKTOK_CONTENT_HOSTS.has(hostname)) return unsupported('Unsupported TikTok host');

  if (first === 't' && segments.length === 2) {
    const code = decodePathPart(segments[1]);
    if (!code || !/^[A-Za-z0-9_-]{4,64}$/.test(code)) return unsupported('Malformed TikTok short link');
    const poisharing = url.searchParams.get('poisharing');
    const canonical = new URL(`https://www.tiktok.com/t/${encodeURIComponent(code)}/`);
    if (poisharing) canonical.searchParams.set('poisharing', poisharing);
    const placeName = poisharing ? normalizePlaceName(poisharing) : undefined;
    return canonicalLink('tiktok', 'tiktok-short', originalUrl, canonical.toString(), { placeName });
  }

  if (first === 'place' && segments.length === 2) {
    const slug = decodePathPart(segments[1]);
    if (!slug) return unsupported('Malformed TikTok place link');
    const match = /^(.*?)-(\d{6,})$/.exec(slug);
    if (!match) return unsupported('TikTok place link has no place id');
    const placeName = normalizePlaceName(match[1]);
    if (!placeName) return unsupported('TikTok place link has no place name');
    const canonical = `https://www.tiktok.com/place/${encodeURIComponent(match[1])}-${match[2]}`;
    return canonicalLink('tiktok', 'tiktok-place', originalUrl, canonical, {
      placeName,
      placeId: match[2],
    });
  }

  if (segments.length === 3) {
    const rawHandle = decodePathPart(segments[0]);
    const mode = segments[1]?.toLowerCase();
    const id = decodePathPart(segments[2]);
    if (!rawHandle?.startsWith('@') || !id || !/^\d{6,}$/.test(id)) {
      return unsupported('Malformed TikTok post link');
    }
    const handle = rawHandle.slice(1).toLowerCase();
    if (!/^[a-z0-9._]{2,32}$/.test(handle)) return unsupported('Malformed TikTok handle');
    if (mode !== 'video' && mode !== 'photo') return unsupported('Unsupported TikTok post type');
    const kind = mode === 'video' ? 'tiktok-video' : 'tiktok-photo';
    return canonicalLink('tiktok', kind, originalUrl, `https://www.tiktok.com/@${handle}/${mode}/${id}`, {
      handle,
      postId: id,
    });
  }

  return unsupported('Unsupported TikTok link');
}

function parseInstagram(url: URL, originalUrl: string): LinkParseResult {
  if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) return unsupported('Unsupported host');
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) return unsupported('Unsupported Instagram link');
  const kindPath = segments[0].toLowerCase();
  const shortcode = decodePathPart(segments[1]);
  if (!shortcode || !/^[A-Za-z0-9_-]{5,32}$/.test(shortcode)) return unsupported('Malformed Instagram post link');
  if (kindPath !== 'p' && kindPath !== 'reel') return unsupported('Unsupported Instagram link');
  const kind = kindPath === 'p' ? 'instagram-post' : 'instagram-reel';
  return canonicalLink('instagram', kind, originalUrl, `https://www.instagram.com/${kindPath}/${shortcode}/`, {
    postId: shortcode,
  });
}

/** Classifies supported social links and returns their stable, tracking-free URL. */
export function parseSocialLink(input: string): LinkParseResult {
  const url = sanitizeInputUrl(input);
  if (!url) return unsupported('Invalid URL');

  const originalUrl = url.toString();
  const hostname = url.hostname.toLowerCase();
  if (TIKTOK_SHORT_HOSTS.has(hostname)) return parseTikTok(url, originalUrl);
  if (INSTAGRAM_HOSTS.has(hostname)) return parseInstagram(url, originalUrl);
  return unsupported('Only TikTok and Instagram links are supported');
}

/** Reparse and return a canonical social link, or null for unsupported URLs. */
export function canonicalizeSocialLink(input: string): CanonicalSocialLink | null {
  const result = parseSocialLink(input);
  return result.supported ? result.link : null;
}
