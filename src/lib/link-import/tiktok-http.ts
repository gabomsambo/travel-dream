/**
 * How Travel Dream talks to TikTok.
 *
 * The user agent names the app honestly — a link-preview bot, never a browser
 * — and one timeout bounds every request, so the page reader and the photo
 * importer can never present different identities or different patience.
 */
export const TIKTOK_USER_AGENT = 'TravelDreamLinkPreview/1.0 (+https://tabidreams.com)';

/** One request to TikTok never gets more than this. */
export const TIKTOK_REQUEST_TIMEOUT_MS = 8_000;
