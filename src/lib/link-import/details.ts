import type {
  CanonicalSocialLink,
  LinkDetails,
  LinkProviderContext,
  LinkProviderRecord,
  LinkProviderResult,
  TikTokImageRef,
} from '@/types/link-import';
import { urlDerivedDetailsProvider } from './providers/url-derived';
import { tiktokOEmbedProvider } from './providers/tiktok-oembed';
import { tiktokPageProvider } from './providers/tiktok-page';

export interface LinkDetailsProvider {
  name: string;
  supports(link: CanonicalSocialLink): boolean;
  getDetails(
    link: CanonicalSocialLink,
    context?: LinkProviderContext,
  ): Promise<LinkDetails | LinkProviderResult | undefined>;
}

export interface EnrichedLinkDetails {
  details: LinkDetails;
  providers: LinkProviderRecord[];
  transient?: { imageRefs?: TikTokImageRef[] };
}

const DEFAULT_PROVIDERS: LinkDetailsProvider[] = [urlDerivedDetailsProvider, tiktokOEmbedProvider, tiktokPageProvider];

function isProviderResult(value: LinkDetails | LinkProviderResult | undefined): value is LinkProviderResult {
  return !!value && typeof value === 'object' &&
    ('details' in value || 'cachedResponse' in value || 'empty' in value || 'reason' in value || 'transient' in value);
}

function asDetails(value: LinkDetails | LinkProviderResult | undefined): LinkDetails | undefined {
  if (!value) return undefined;
  return isProviderResult(value) ? value.details : value;
}

/** Adds providers in order; later sources fill gaps without erasing known details. */
export function mergeLinkDetails(records: LinkProviderRecord[]): LinkDetails {
  const merged: LinkDetails = {};
  for (const record of records) {
    for (const key of Object.keys(record.details ?? {}) as Array<keyof LinkDetails>) {
      const value = record.details?.[key];
      if (value && !merged[key]) Object.assign(merged, { [key]: value });
    }
  }
  return merged;
}

/** Providers fill missing details in order; page readers stay behind this seam. */
export async function enrichLinkDetails(
  link: CanonicalSocialLink,
  providers: LinkDetailsProvider[] = DEFAULT_PROVIDERS,
  context?: LinkProviderContext,
): Promise<EnrichedLinkDetails> {
  const records: LinkProviderRecord[] = [];
  let transient: { imageRefs?: TikTokImageRef[] } | undefined;

  for (const provider of providers) {
    if (!provider.supports(link)) continue;
    const fetchedAt = new Date().toISOString();
    try {
      const output = await provider.getDetails(link, context);
      const details = asDetails(output);
      const providerResult = isProviderResult(output) ? output : undefined;
      if (providerResult?.transient?.imageRefs) transient = providerResult.transient;
      records.push({
        provider: provider.name,
        status: details && Object.keys(details).length > 0 ? 'ok' : 'empty',
        ...(details ? { details } : {}),
        ...(providerResult?.cachedResponse ? { cachedResponse: providerResult.cachedResponse } : {}),
        ...(providerResult?.reason ? { reason: providerResult.reason } : {}),
        fetchedAt,
      });
    } catch {
      records.push({ provider: provider.name, status: 'error', error: 'provider-unavailable', fetchedAt });
    }
  }

  return { details: mergeLinkDetails(records), providers: records, ...(transient ? { transient } : {}) };
}
