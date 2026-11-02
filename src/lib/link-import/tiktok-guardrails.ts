import { Redis } from '@upstash/redis';
import type { LinkDetails, LinkProviderReason } from '@/types/link-import';

const POSITIVE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const GONE_CACHE_MS = 24 * 60 * 60 * 1000;
const TRANSIENT_CACHE_MS = 15 * 60 * 1000;
const THROTTLE_MS = 10_000;
const BREAKER_INITIAL_MS = 15 * 60 * 1000;
const BREAKER_MAX_MS = 6 * 60 * 60 * 1000;

export interface TikTokCacheEntry {
  reason?: LinkProviderReason;
  details?: LinkDetails;
}

export interface TikTokRedisClient {
  get<TData = unknown>(key: string): Promise<TData | null>;
  set(key: string, value: unknown, options?: { ex?: number; px?: number; nx?: boolean }): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

export interface TikTokGuardrails {
  getCache(postId: string): Promise<TikTokCacheEntry | undefined>;
  setCache(postId: string, entry: TikTokCacheEntry, ttlMs: number): Promise<void>;
  isBreakerOpen(): Promise<boolean>;
  openBreaker(): Promise<number>;
  clearBreaker(): Promise<void>;
  reserveRequestSlot(): Promise<boolean>;
}

/** Small, testable wrapper for the shared Upstash safety state. */
export function createTikTokGuardrails(
  redis: TikTokRedisClient,
  now: () => number = Date.now,
): TikTokGuardrails {
  return {
    async getCache(postId) {
      const entry = await redis.get<TikTokCacheEntry>(`tiktok:page:v1:${postId}`);
      return entry ?? undefined;
    },
    async setCache(postId, entry, ttlMs) {
      await redis.set(`tiktok:page:v1:${postId}`, entry, { ex: Math.max(1, Math.ceil(ttlMs / 1000)) });
    },
    async isBreakerOpen() {
      const openUntil = await redis.get<number>('tiktok:page:breaker:until');
      return typeof openUntil === 'number' && openUntil > now();
    },
    async openBreaker() {
      const priorLevel = await redis.get<number>('tiktok:page:breaker:level');
      const level = Math.min(6, Math.max(1, (typeof priorLevel === 'number' ? priorLevel : 0) + 1));
      const duration = Math.min(BREAKER_INITIAL_MS * (2 ** (level - 1)), BREAKER_MAX_MS);
      const ttl = Math.ceil(duration / 1000);
      await redis.set('tiktok:page:breaker:level', level, { ex: Math.ceil(BREAKER_MAX_MS / 1000) });
      await redis.set('tiktok:page:breaker:until', now() + duration, { ex: ttl });
      return duration;
    },
    async clearBreaker() {
      await redis.del('tiktok:page:breaker:until', 'tiktok:page:breaker:level');
    },
    async reserveRequestSlot() {
      const acquired = await redis.set('tiktok:page:global-slot', now(), { nx: true, px: THROTTLE_MS });
      return acquired === 'OK';
    },
  };
}

let redisClient: Redis | null | undefined;
let guardrails: TikTokGuardrails | undefined;

/** Return null if Upstash is missing; TikTok reads then fail closed. */
export function getTikTokGuardrails(): TikTokGuardrails | null {
  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      redisClient = null;
      return null;
    }
    try {
      redisClient = new Redis({ url, token });
    } catch {
      redisClient = null;
      return null;
    }
  }
  if (!redisClient) return null;
  guardrails ??= createTikTokGuardrails(redisClient);
  return guardrails;
}

export const TIKTOK_CACHE_TTLS = {
  positive: POSITIVE_CACHE_MS,
  gone: GONE_CACHE_MS,
  transient: TRANSIENT_CACHE_MS,
  throttle: THROTTLE_MS,
  breakerInitial: BREAKER_INITIAL_MS,
  breakerMax: BREAKER_MAX_MS,
} as const;
