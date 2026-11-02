import type { CanonicalSocialLink, LinkResolution } from '@/types/link-import';
import { parseSocialLink } from './url';

const MAX_REDIRECTS = 5;
const RESOLUTION_TIMEOUT_MS = 5_000;

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface TikTokShortLinkResolution {
  link: CanonicalSocialLink;
  resolution: LinkResolution;
}

function isTikTokHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'tiktok.com' || host.endsWith('.tiktok.com');
}

function allowedRedirect(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (
      url.protocol !== 'https:' ||
      !isTikTokHost(url.hostname) ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.port.length > 0
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function unresolved(link: CanonicalSocialLink, error: LinkResolution['error']): TikTokShortLinkResolution {
  return { link, resolution: { status: 'unresolved', error } };
}

/**
 * Resolve only TikTok short URLs by inspecting bounded manual redirects.
 * Redirect bodies are never read; each destination is revalidated before fetch.
 */
export async function resolveTikTokShortLink(
  link: CanonicalSocialLink,
  fetcher: Fetcher = fetch,
): Promise<TikTokShortLinkResolution> {
  if (!link.needsResolution || link.platform !== 'tiktok' || link.kind !== 'tiktok-short') {
    return { link, resolution: { status: 'not-needed' } };
  }

  let current = allowedRedirect(link.canonicalUrl, link.canonicalUrl);
  if (!current) return unresolved(link, 'invalid-redirect');
  const signal = AbortSignal.timeout(RESOLUTION_TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetcher(current, {
        redirect: 'manual',
        signal,
      });
    } catch {
      return unresolved(link, 'fetch-failed');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return unresolved(link, 'not-canonical');
      if (hop === MAX_REDIRECTS) return unresolved(link, 'hop-limit');
      const next = allowedRedirect(location, current);
      if (!next) return unresolved(link, 'invalid-redirect');
      current = next;
      continue;
    }

    const parsed = parseSocialLink(current);
    if (parsed.supported && parsed.link.kind !== 'tiktok-short') {
      return {
        link: {
          ...parsed.link,
          originalUrl: link.originalUrl,
          placeName: parsed.link.placeName ?? link.placeName,
        },
        resolution: { status: 'resolved' },
      };
    }
    return unresolved(link, 'not-canonical');
  }

  return unresolved(link, 'hop-limit');
}
