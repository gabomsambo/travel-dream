import { parseSocialLink } from '@/lib/link-import/url';

/**
 * What a share sheet hands over. Android puts the link in `text` (often with a
 * caption around it) and leaves `url` empty; desktop Chrome and an iPhone
 * Shortcut usually fill `url`. `title` is the page title, if anything.
 */
export interface SharedPayload {
  url?: string | null;
  text?: string | null;
  title?: string | null;
}

const HTTP_URL = /https?:\/\/[^\s<>"'`“”‘’]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?…]+$/;
const MAX_FIELD_LENGTH = 8_000;

function trimUrl(candidate: string): string {
  let url = candidate.replace(TRAILING_PUNCTUATION, '');
  // A closing bracket belongs to the URL only when the URL also opened one.
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']] as const) {
    while (url.endsWith(close) && url.split(open).length < url.split(close).length) {
      url = url.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
    }
  }
  return url;
}

/** Every http(s) URL in `value`, in order. */
function urlsIn(value: string | null | undefined): string[] {
  if (!value) return [];
  return (value.slice(0, MAX_FIELD_LENGTH).match(HTTP_URL) ?? []).map(trimUrl).filter(Boolean);
}

/**
 * The link to save from a share: the first TikTok or Instagram URL found in
 * `url`, then `text`, then `title`; failing that, the first http(s) URL of
 * any kind (so the caller can say it is unsupported); null when there is none.
 */
export function extractSharedUrl(payload: SharedPayload): string | null {
  const candidates = [payload.url, payload.text, payload.title].flatMap(urlsIn);
  return candidates.find((url) => parseSocialLink(url).supported) ?? candidates[0] ?? null;
}

/** The DOM id of a saved link's card in the Inbox. */
export function inboxLinkAnchorId(sourceId: string): string {
  return `link-${sourceId}`;
}

/** What the Inbox tells someone who just arrived from a share (`?shared=`). */
export const SHARE_NOTICES = ['saved', 'duplicate', 'missing', 'unsupported', 'failed', 'busy'] as const;
export type ShareNotice = (typeof SHARE_NOTICES)[number];

export function parseShareNotice(value: string | undefined): ShareNotice | undefined {
  return SHARE_NOTICES.find((notice) => notice === value);
}

/** Where a just-shared link lands: the Inbox, scrolled to and highlighting that link. */
export function inboxLinkHref(sourceId: string, notice?: Extract<ShareNotice, 'saved' | 'duplicate'>): string {
  const params = new URLSearchParams({ link: sourceId });
  if (notice) params.set('shared', notice);
  return `/inbox?${params.toString()}#${inboxLinkAnchorId(sourceId)}`;
}
