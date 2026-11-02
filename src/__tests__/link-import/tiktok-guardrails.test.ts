/** @jest-environment node */
import { createTikTokGuardrails, TIKTOK_CACHE_TTLS, type TikTokRedisClient } from '@/lib/link-import/tiktok-guardrails';

function redisStub(now: () => number = Date.now) {
  const values = new Map<string, { value: unknown; expiresAt?: number }>();
  const get = async <TData = unknown>(key: string): Promise<TData | null> => {
    const entry = values.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && entry.expiresAt <= now()) {
      values.delete(key);
      return null;
    }
    return entry.value as TData;
  };
  const redis: TikTokRedisClient = {
    get,
    set: jest.fn(async (key: string, value: unknown, options?: { ex?: number; px?: number; nx?: boolean }) => {
      const existing = values.get(key);
      if (options?.nx && existing && (existing.expiresAt === undefined || existing.expiresAt > now())) return null;
      const ttl = options?.px ?? (options?.ex === undefined ? undefined : options.ex * 1_000);
      values.set(key, { value, ...(ttl === undefined ? {} : { expiresAt: now() + ttl }) });
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => keys.reduce((count, key) => count + Number(values.delete(key)), 0)),
  };
  return { redis, values };
}

describe('TikTok Upstash guardrails', () => {
  it('uses one app-wide Redis slot per ten seconds', async () => {
    let now = 1_000_000;
    const { redis } = redisStub(() => now);
    const guardrails = createTikTokGuardrails(redis, () => now);

    await expect(guardrails.reserveRequestSlot()).resolves.toBe(true);
    await expect(guardrails.reserveRequestSlot()).resolves.toBe(false);
    expect(redis.set).toHaveBeenCalledWith('tiktok:page:global-slot', now, { nx: true, px: 10_000 });

    now += 10_001;
    await expect(guardrails.reserveRequestSlot()).resolves.toBe(true);
  });

  it('doubles breaker duration from 15 minutes up to six hours', async () => {
    let now = 1_000_000;
    const { redis, values } = redisStub(() => now);
    const guardrails = createTikTokGuardrails(redis, () => now);

    await expect(guardrails.openBreaker()).resolves.toBe(15 * 60_000);
    expect(await guardrails.isBreakerOpen()).toBe(true);
    await expect(guardrails.openBreaker()).resolves.toBe(30 * 60_000);
    await expect(guardrails.openBreaker()).resolves.toBe(60 * 60_000);
    for (let count = 0; count < 6; count += 1) await guardrails.openBreaker();
    await expect(guardrails.openBreaker()).resolves.toBe(TIKTOK_CACHE_TTLS.breakerMax);

    now += TIKTOK_CACHE_TTLS.breakerMax + 1;
    expect(await guardrails.isBreakerOpen()).toBe(false);
    await guardrails.clearBreaker();
    expect(values.has('tiktok:page:breaker:until')).toBe(false);
    expect(values.has('tiktok:page:breaker:level')).toBe(false);
  });

  it('stores normalized cache entries with their selected TTL', async () => {
    const { redis } = redisStub();
    const guardrails = createTikTokGuardrails(redis, () => 123);
    await guardrails.setCache('post-1', { reason: 'gone' }, TIKTOK_CACHE_TTLS.gone);
    expect(redis.set).toHaveBeenCalledWith('tiktok:page:v1:post-1', { reason: 'gone' }, { ex: 86_400 });
    await expect(guardrails.getCache('post-1')).resolves.toEqual({ reason: 'gone' });
  });
});
