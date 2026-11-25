/**
 * The post-login destination from a `callbackUrl` query value, limited to a
 * path on this site. Middleware sets it to the page a signed-out visitor asked
 * for (query included, so `/share-target?url=…` survives the login), but the
 * value is caller-controlled: anything that is not a plain same-site path
 * (`https://…`, `//host`, `/\host`, `javascript:`) falls back to the Inbox.
 */
export function safeCallbackPath(value: string | null | undefined, fallback = '/inbox'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
