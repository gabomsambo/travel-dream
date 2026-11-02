import type {
  CanonicalSocialLink,
  LinkDetails,
  LinkProviderContext,
  LinkProviderResult,
  TikTokImageRef,
} from '@/types/link-import';
import { checkRateLimit, getRateLimitRemaining } from '@/lib/rate-limit';
import type { LinkDetailsProvider } from '../details';
import { getTikTokGuardrails, TIKTOK_CACHE_TTLS, type TikTokGuardrails } from '../tiktok-guardrails';
import { TikTokRehydrationSchema, type TikTokItem } from '../tiktok-schemas';

const USER_AGENT = 'TravelDreamLinkPreview/1.0 (+https://tabidreams.com)';
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const MAX_IMAGES = 20;
const REHYDRATION_PAYLOAD = /<script[^>]*id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i;
/**
 * Block walls are matched against the page's visible text, never against the
 * post payload: a caption that happens to say "access denied" is content, and
 * content must never open the app-wide breaker.
 */
const BLOCK_MARKER = /captcha|verify\s+to\s+continue|request\s+blocked|access\s+denied/i;
const DEFAULT_TEST_POSTS = [
  'https://www.tiktok.com/@cherrypiego/video/7694185850497666335',
  'https://www.tiktok.com/@yourlisbongirl/video/7634085795908881686',
] as const;

type Fetcher = typeof fetch;
type FetchOutcome =
  | { kind: 'body'; body: string; status: number; headers: Headers }
  | { kind: 'http'; status: number; body?: string }
  | { kind: 'throttled' }
  | { kind: 'redirect-error' }
  | { kind: 'too-large' }
  | { kind: 'network-error' };

interface ProviderDeps {
  enabled?: () => boolean;
  getGuardrails?: () => TikTokGuardrails | null;
  hasDailyAllowance?: (userId: string) => Promise<boolean>;
  chargeDailyRequest?: (userId: string) => Promise<boolean>;
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultEnabled(): boolean {
  return process.env.TIKTOK_PAGE_FETCH_ENABLED === 'true';
}

async function defaultHasDailyAllowance(userId: string): Promise<boolean> {
  const remaining = await getRateLimitRemaining(`user:${userId}`, 'tiktok-page');
  return remaining !== null && remaining > 0;
}

async function defaultChargeDailyRequest(userId: string): Promise<boolean> {
  const result = await checkRateLimit(`user:${userId}`, 'tiktok-page');
  // The shared limiter reports limit=0 when Upstash is missing or unavailable.
  return result.limit > 0 && result.success;
}

function allowedTikTokPageUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== 'https:' ||
      !['www.tiktok.com', 'tiktok.com'].includes(url.hostname.toLowerCase()) ||
      url.username || url.password || url.port
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function postFetchUrl(link: CanonicalSocialLink): string | null {
  if (!link.postId || !/^\d{6,}$/.test(link.postId) || !link.handle || !/^[a-z0-9._]{2,32}$/i.test(link.handle)) return null;
  return `https://www.tiktok.com/@${link.handle}/video/${link.postId}`;
}

async function readBoundedBody(response: Response): Promise<string | 'too-large'> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_PAGE_BYTES) return 'too-large';
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      return 'too-large';
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function waitForRequestSlot(
  guardrails: TikTokGuardrails,
  wait: boolean,
  sleep: (ms: number) => Promise<void>,
): Promise<string | null> {
  const slot = await guardrails.reserveRequestSlot();
  if (slot) return slot;
  if (!wait) return null;
  for (let elapsed = 0; elapsed < TIKTOK_CACHE_TTLS.throttle; elapsed += 500) {
    await sleep(500);
    const retrySlot = await guardrails.reserveRequestSlot();
    if (retrySlot) return retrySlot;
  }
  return null;
}

async function requestTikTokHtml(
  initialUrl: string,
  guardrails: TikTokGuardrails,
  options: {
    fetcher: Fetcher;
    sleep: (ms: number) => Promise<void>;
    waitForSlot: boolean;
    /** A read-only allowance check before reserving the global slot. */
    beforeSlotReserved?: () => Promise<boolean>;
    /** After a global slot is reserved, before HTTP. Return false to abort as throttled. */
    afterSlotReserved?: () => Promise<boolean>;
  },
): Promise<FetchOutcome> {
  let current = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const checkedUrl = allowedTikTokPageUrl(current);
    if (!checkedUrl) return { kind: 'redirect-error' };
    if (options.beforeSlotReserved && !(await options.beforeSlotReserved())) return { kind: 'throttled' };
    const slot = await waitForRequestSlot(guardrails, options.waitForSlot || hop > 0, options.sleep);
    if (!slot) return { kind: 'throttled' };
    if (options.afterSlotReserved) {
      let allowed: boolean;
      try {
        allowed = await options.afterSlotReserved();
      } catch (error) {
        await guardrails.releaseRequestSlot(slot);
        throw error;
      }
      if (!allowed) {
        await guardrails.releaseRequestSlot(slot);
        return { kind: 'throttled' };
      }
    }
    let response: Response;
    try {
      response = await options.fetcher(checkedUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en',
          'accept-encoding': 'gzip, br',
        },
      });
    } catch {
      return { kind: 'network-error' };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      const next = location ? allowedTikTokPageUrl(new URL(location, checkedUrl).toString()) : null;
      if (!next || hop === MAX_REDIRECTS) return { kind: 'redirect-error' };
      current = next.toString();
      continue;
    }
    if (response.status >= 500) return { kind: 'http', status: response.status };
    if (!response.ok && response.status !== 403 && response.status !== 429) {
      return { kind: 'http', status: response.status };
    }

    let body: string | 'too-large';
    try {
      body = await readBoundedBody(response);
    } catch {
      return { kind: 'network-error' };
    }
    if (body === 'too-large') return { kind: 'too-large' };
    if (response.status === 403 || response.status === 429) return { kind: 'http', status: response.status, body };
    return { kind: 'body', body, status: response.status, headers: response.headers };
  }
  return { kind: 'redirect-error' };
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function scalar(value: string | number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function parseExpiry(url: string): number | undefined {
  try {
    const seconds = Number(new URL(url).searchParams.get('x-expires'));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export function isTikTokImageCdnUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (host.endsWith('.tiktokcdn.com') || host.endsWith('.tiktokcdn-eu.com') || host.endsWith('.tiktokcdn-us.com'));
  } catch {
    return false;
  }
}

function mapImages(item: TikTokItem, contentKind: 'photo' | 'video'): TikTokImageRef[] {
  const refs: TikTokImageRef[] = [];
  for (const image of item?.imagePost?.images ?? []) {
    const url = image.imageURL?.urlList?.find(isTikTokImageCdnUrl);
    if (!url) continue;
    refs.push({
      url,
      ...(typeof image.imageWidth === 'number' ? { width: image.imageWidth } : {}),
      ...(typeof image.imageHeight === 'number' ? { height: image.imageHeight } : {}),
      ...(parseExpiry(url) ? { expiresAt: parseExpiry(url) } : {}),
    });
    if (refs.length >= MAX_IMAGES) break;
  }
  if (refs.length === 0 && contentKind === 'video') {
    // A video post has no carousel, so its cover is the post image. Photo posts
    // never fall back to the cover: that would save a video thumbnail as if it
    // were one of the carousel photos the user tapped.
    const cover = [item?.video?.cover, item?.video?.originCover, item?.video?.dynamicCover]
      .find((value): value is string => Boolean(value && isTikTokImageCdnUrl(value)));
    if (cover) refs.push({ url: cover, ...(parseExpiry(cover) ? { expiresAt: parseExpiry(cover) } : {}) });
  }
  return refs;
}

function mapPost(item: TikTokItem, link: CanonicalSocialLink): { details: LinkDetails; imageRefs: TikTokImageRef[] } {
  const caption = nonEmpty(item?.desc) ?? nonEmpty(item?.contents?.[0]?.desc);
  const hashtags = [...new Set([
    ...(item?.challenges ?? []).map((challenge) => nonEmpty(challenge.title)),
    ...(item?.textExtra ?? []).map((entry) => nonEmpty(entry.hashtagName)),
  ].filter((tag): tag is string => Boolean(tag)).map((tag) => tag.replace(/^#/, '')))];
  const place = item?.poi;
  const handle = nonEmpty(item?.author?.uniqueId) ?? link.handle;
  const title = nonEmpty(item?.imagePost?.title) ?? nonEmpty(caption?.split(/\r?\n/, 1)[0]);
  const postedAt = Number(item?.createTime);
  const contentKind: 'photo' | 'video' = item?.imagePost || link.kind === 'tiktok-photo' ? 'photo' : 'video';
  const details: LinkDetails = {
    ...(caption ? { caption } : {}),
    ...(hashtags.length > 0 ? { hashtags } : {}),
    ...(nonEmpty(item?.author?.nickname) ? { author: nonEmpty(item?.author?.nickname) } : {}),
    ...(handle ? { authorHandle: handle } : {}),
    ...(nonEmpty(place?.name) ? { placeName: nonEmpty(place?.name) } : {}),
    ...(nonEmpty(place?.address) ? { placeAddress: nonEmpty(place?.address) } : {}),
    ...(nonEmpty(place?.category) || nonEmpty(place?.ttTypeNameTiny)
      ? { placeCategory: nonEmpty(place?.category) ?? nonEmpty(place?.ttTypeNameTiny) }
      : {}),
    ...(nonEmpty(place?.city) ? { placeCity: nonEmpty(place?.city) } : {}),
    ...(scalar(place?.id) ? { placeSourceId: scalar(place?.id) } : {}),
    ...(title ? { title } : {}),
    ...(Number.isFinite(postedAt) && postedAt > 0 ? { postedAt } : {}),
    contentKind,
    sourceUrl: link.canonicalUrl,
  };
  return { details, imageRefs: mapImages(item, contentKind) };
}

/** What the page shows a reader: no scripts, no styles, no meta tags, no title. */
function visiblePageText(body: string): string {
  return body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<meta\b[^>]*>/gi, ' ')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function parseRehydration(body: string, link: CanonicalSocialLink):
  | { ok: true; details: LinkDetails; imageRefs: TikTokImageRef[] }
  | { ok: false; reason: 'blocked' | 'format_changed' | 'gone' | 'unavailable'; breaker: boolean } {
  const match = REHYDRATION_PAYLOAD.exec(body);
  if (!match) return { ok: false, reason: 'blocked', breaker: true };
  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    return { ok: false, reason: 'blocked', breaker: true };
  }
  const parsed = TikTokRehydrationSchema.safeParse(raw);
  if (!parsed.success) {
    return BLOCK_MARKER.test(visiblePageText(body))
      ? { ok: false, reason: 'blocked', breaker: true }
      : { ok: false, reason: 'format_changed', breaker: false };
  }
  const videoDetail = parsed.data.__DEFAULT_SCOPE__?.['webapp.video-detail'];
  if (!videoDetail) return { ok: false, reason: 'blocked', breaker: true };
  const statusCode = Number(videoDetail.statusCode ?? 0);
  if (statusCode === 10204) return { ok: false, reason: 'gone', breaker: false };
  if (statusCode !== 0) return { ok: false, reason: 'unavailable', breaker: false };
  const item = videoDetail.itemInfo?.itemStruct;
  if (!item) return { ok: false, reason: 'format_changed', breaker: false };
  return { ok: true, ...mapPost(item, link) };
}

export function createTikTokPageProvider(deps: ProviderDeps = {}): LinkDetailsProvider {
  const enabled = deps.enabled ?? defaultEnabled;
  const getGuardrails = deps.getGuardrails ?? getTikTokGuardrails;
  const hasDailyAllowance = deps.hasDailyAllowance ?? defaultHasDailyAllowance;
  const chargeDailyRequest = deps.chargeDailyRequest ?? defaultChargeDailyRequest;
  const fetcher = deps.fetcher ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;

  async function read(link: CanonicalSocialLink, context: LinkProviderContext = {}): Promise<LinkProviderResult> {
    if (!enabled()) return { empty: true, reason: 'disabled' };
    if (link.platform !== 'tiktok' || !link.postId || !link.handle) return { empty: true, reason: 'unavailable' };
    const url = postFetchUrl(link);
    if (!url) return { empty: true, reason: 'unavailable' };
    const guardrails = getGuardrails();
    const userId = context.userId;
    if (!guardrails || !userId) return { empty: true, reason: 'safety_unavailable' };

    try {
      if (!context.forceRefresh) {
        const cached = await guardrails.getCache(link.postId);
        if (cached) return { ...(cached.details ? { details: cached.details } : {}), empty: !cached.details, ...(cached.reason ? { reason: cached.reason } : {}) };
      }
      if (await guardrails.isBreakerOpen()) return { empty: true, reason: 'blocked' };

      let attempt = 0;
      let chargedDaily = false;
      while (attempt < 2) {
        if (attempt > 0) await sleep(2_000 + Math.round(random() * 500));
        const outcome = await requestTikTokHtml(url, guardrails, {
          fetcher,
          sleep,
          waitForSlot: attempt > 0,
          beforeSlotReserved: async () => chargedDaily || hasDailyAllowance(userId),
          afterSlotReserved: async () => {
            if (chargedDaily) return true;
            if (!(await chargeDailyRequest(userId))) return false;
            chargedDaily = true;
            return true;
          },
        });
        if (outcome.kind === 'http' && (outcome.status === 403 || outcome.status === 429)) {
          await guardrails.openBreaker();
          return { empty: true, reason: 'blocked' };
        }
        if (outcome.kind === 'body' && outcome.status >= 200 && outcome.status < 300) {
          const parsed = parseRehydration(outcome.body, link);
          if (!parsed.ok) {
            if (parsed.breaker) await guardrails.openBreaker();
            const ttl = parsed.reason === 'gone' ? TIKTOK_CACHE_TTLS.gone : TIKTOK_CACHE_TTLS.transient;
            await guardrails.setCache(link.postId, { reason: parsed.reason }, ttl);
            return { empty: true, reason: parsed.reason };
          }
          await guardrails.clearBreaker();
          await guardrails.setCache(link.postId, { details: parsed.details }, TIKTOK_CACHE_TTLS.positive);
          return {
            details: parsed.details,
            transient: { imageRefs: parsed.imageRefs },
          };
        }

        if (outcome.kind === 'http' && outcome.status >= 500) {
          attempt += 1;
          continue;
        }
        if (outcome.kind === 'network-error') {
          attempt += 1;
          continue;
        }
        if (outcome.kind === 'throttled') return { empty: true, reason: 'throttled' };
        if (outcome.kind === 'too-large') {
          await guardrails.setCache(link.postId, { reason: 'format_changed' }, TIKTOK_CACHE_TTLS.transient);
          return { empty: true, reason: 'format_changed' };
        }
        await guardrails.setCache(link.postId, { reason: 'unavailable' }, TIKTOK_CACHE_TTLS.transient);
        return { empty: true, reason: 'unavailable' };
      }
      await guardrails.setCache(link.postId, { reason: 'transient' }, TIKTOK_CACHE_TTLS.transient);
      return { empty: true, reason: 'transient' };
    } catch {
      return { empty: true, reason: 'safety_unavailable' };
    }
  }

  return {
    name: 'tiktok-page',
    supports: (link) => link.platform === 'tiktok' && (link.kind === 'tiktok-photo' || link.kind === 'tiktok-video'),
    getDetails: read,
  };
}

/** Offline tests and the protected diagnostic route share bounded single-page reads. */
export async function inspectTikTokPage(
  url: string,
  fetcher: Fetcher = fetch,
): Promise<{ status: number | null; shell: boolean; rateLimited: boolean }> {
  const checked = allowedTikTokPageUrl(url);
  if (!checked) return { status: null, shell: true, rateLimited: false };
  try {
    const response = await fetcher(checked, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en',
        'accept-encoding': 'gzip, br',
      },
    });
    const body = response.ok ? await readBoundedBody(response) : '';
    const html = typeof body === 'string' ? body : '';
    return {
      status: response.status,
      shell: !html.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__') || !html.includes('webapp.video-detail'),
      rateLimited: response.status === 429,
    };
  } catch {
    return { status: null, shell: true, rateLimited: false };
  }
}

export const tiktokPageProvider = createTikTokPageProvider();
export const TIKTOK_DIAGNOSTIC_POSTS = DEFAULT_TEST_POSTS;
