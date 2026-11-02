import type { CanonicalSocialLink, LinkDetails, LinkProviderRecord } from '@/types/link-import';
import { urlDerivedDetailsProvider } from './providers/url-derived';
import { tiktokOEmbedProvider, type LinkProviderResult } from './providers/tiktok-oembed';

export interface LinkDetailsProvider {
  name: string;
  supports(link: CanonicalSocialLink): boolean;
  getDetails(link: CanonicalSocialLink): Promise<LinkDetails | LinkProviderResult | undefined>;
}

export interface EnrichedLinkDetails {
  details: LinkDetails;
  providers: LinkProviderRecord[];
}

const DEFAULT_PROVIDERS: LinkDetailsProvider[] = [urlDerivedDetailsProvider, tiktokOEmbedProvider];

function isProviderResult(value: LinkDetails | LinkProviderResult | undefined): value is LinkProviderResult {
  return !!value && typeof value === 'object' &&
    ('details' in value || 'cachedResponse' in value || 'empty' in value);
}

function asDetails(value: LinkDetails | LinkProviderResult | undefined): LinkDetails | undefined {
  if (!value) return undefined;
  return isProviderResult(value) ? value.details : value;
}

/** Adds providers in order; later sources fill gaps without erasing known details. */
export function mergeLinkDetails(records: LinkProviderRecord[]): LinkDetails {
  const merged: LinkDetails = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record.details ?? {}) as Array<[keyof LinkDetails, string | undefined]>) {
      if (value && !merged[key]) merged[key] = value;
    }
  }
  return merged;
}

/**
 * Page-reading is deliberately a provider seam: add one provider file and
 * register it here when landing-page details are approved for a later step.
 */
export async function enrichLinkDetails(
  link: CanonicalSocialLink,
  providers: LinkDetailsProvider[] = DEFAULT_PROVIDERS,
): Promise<EnrichedLinkDetails> {
  const records: LinkProviderRecord[] = [];

  for (const provider of providers) {
    if (!provider.supports(link)) continue;
    const fetchedAt = new Date().toISOString();
    try {
      const output = await provider.getDetails(link);
      const details = asDetails(output);
      const providerResult = isProviderResult(output) ? output : undefined;
      records.push({
        provider: provider.name,
        status: details && Object.keys(details).length > 0 ? 'ok' : 'empty',
        ...(details ? { details } : {}),
        ...(providerResult?.cachedResponse ? { cachedResponse: providerResult.cachedResponse } : {}),
        fetchedAt,
      });
    } catch {
      records.push({ provider: provider.name, status: 'error', error: 'provider-unavailable', fetchedAt });
    }
  }

  return { details: mergeLinkDetails(records), providers: records };
}
