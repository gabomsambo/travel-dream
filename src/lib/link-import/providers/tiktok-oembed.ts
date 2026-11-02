import type { CanonicalSocialLink, LinkDetails } from '@/types/link-import';
import type { LinkDetailsProvider } from '../details';
import type { LinkProviderResult } from '@/types/link-import';

type OEmbedResponse = Record<string, unknown>;

export class TikTokOEmbedNoDataError extends Error {
  constructor() {
    super('TikTok oEmbed returned no data');
    this.name = 'TikTokOEmbedNoDataError';
  }
}

function stringField(response: OEmbedResponse, field: string): string | undefined {
  const value = response[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function scalarFields(response: OEmbedResponse): Record<string, string | number | boolean | null> {
  const fields = [
    'version', 'type', 'width', 'height', 'provider_url', 'provider_name', 'embed_product_id',
    'embed_type', 'title', 'author_name', 'author_url',
  ];
  const cached: Record<string, string | number | boolean | null> = {};
  for (const field of fields) {
    const value = response[field];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      cached[field] = value;
    }
  }
  return cached;
}

export function createTikTokOEmbedProvider(
  fetcher: typeof fetch = fetch,
): LinkDetailsProvider {
  return {
    name: 'tiktok-oembed',
    supports: (link) => link.platform === 'tiktok' && link.kind === 'tiktok-video',
    async getDetails(link: CanonicalSocialLink): Promise<LinkProviderResult> {
      const endpoint = new URL('https://www.tiktok.com/oembed');
      endpoint.searchParams.set('url', link.canonicalUrl);
      const response = await fetcher(endpoint, { signal: AbortSignal.timeout(4_000) });
      if (response.status === 400) return { empty: true };
      if (!response.ok) throw new Error(`TikTok oEmbed returned HTTP ${response.status}`);

      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { empty: true };
      }
      const object = payload as OEmbedResponse;
      const author = stringField(object, 'author_name');
      const title = stringField(object, 'title');
      const details: LinkDetails = {
        ...(author ? { author } : {}),
        ...(title ? { title } : {}),
      };
      return {
        ...(Object.keys(details).length > 0 ? { details } : {}),
        cachedResponse: scalarFields(object),
        empty: Object.keys(details).length === 0,
      };
    },
  };
}

export const tiktokOEmbedProvider = createTikTokOEmbedProvider();
