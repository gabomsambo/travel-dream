import 'server-only';
import { headers } from 'next/headers';
import { listShareTokens } from '@/lib/phone-share-tokens';
import type { ShareTokenSummary } from '@/types/share-tokens';

/** This deployment's origin as the browser sees it, for URLs pasted into a Shortcut. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || (local ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * The caller's share tokens, or null when they cannot be read. A page that
 * shows them must still render if the `share_tokens` migration has not reached
 * this database yet, so a failure here never takes the page down with it.
 */
export async function shareTokensOrNull(userId: string): Promise<ShareTokenSummary[] | null> {
  try {
    return await listShareTokens(userId);
  } catch (error) {
    console.error('[Share Tokens] Could not list tokens:', error);
    return null;
  }
}
