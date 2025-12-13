import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

export type RateLimitTier = 'strict' | 'standard' | 'relaxed' | 'auth';

interface RateLimitConfig {
  requests: number;
  window: `${number} ${'s' | 'm' | 'h'}`;
  prefix: string;
}

const RATE_LIMIT_TIERS: Record<RateLimitTier, RateLimitConfig> = {
  auth: { requests: 5, window: '1 h', prefix: 'rl:auth' },
  strict: { requests: 5, window: '1 m', prefix: 'rl:strict' },
  standard: { requests: 30, window: '1 m', prefix: 'rl:std' },
  relaxed: { requests: 100, window: '1 m', prefix: 'rl:rel' },
};

const ROUTE_TIERS: Record<string, RateLimitTier> = {
  '/api/auth/register': 'auth',
  '/api/llm-process': 'strict',
  '/api/upload/process': 'strict',
  '/api/upload': 'standard',
  '/api/google-places': 'standard',
};

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

const ephemeralCache = new Map();

let redis: Redis | null = null;
let rateLimitEnabled = false;

function initializeRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('[RateLimit] Redis not configured - rate limiting disabled');
    return null;
  }

  try {
    const client = new Redis({ url, token });
    rateLimitEnabled = true;
    console.log('[RateLimit] Redis initialized successfully');
    return client;
  } catch (error) {
    console.warn('[RateLimit] Redis init failed:', error);
    return null;
  }
}

const limiters = new Map<RateLimitTier, Ratelimit>();

function getLimiter(tier: RateLimitTier): Ratelimit | null {
  if (!rateLimitEnabled && !redis) {
    redis = initializeRedis();
    if (!redis) return null;
  }

  if (!limiters.has(tier)) {
    const config = RATE_LIMIT_TIERS[tier];
    limiters.set(tier, new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(config.requests, config.window),
      prefix: config.prefix,
      ephemeralCache,
      analytics: true,
    }));
  }

  return limiters.get(tier)!;
}

export function getClientIdentifier(request: NextRequest, userId?: string): string {
  if (userId) return `user:${userId}`;

  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  return `ip:${ip}`;
}

export function isBetaTester(userId: string): boolean {
  const betaTesters = process.env.BETA_TESTER_IDS?.split(',').map(id => id.trim()) || [];
  return betaTesters.includes(userId);
}

export async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier
): Promise<RateLimitResult> {
  const limiter = getLimiter(tier);

  if (!limiter) {
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    console.error('[RateLimit] Check failed:', error);
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));

  return NextResponse.json(
    {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.reset.toString(),
        'Retry-After': retryAfter.toString(),
      },
    }
  );
}

export function getRouteTier(pathname: string, userId?: string): RateLimitTier {
  if (userId && isBetaTester(userId)) {
    return 'relaxed';
  }

  for (const [route, tier] of Object.entries(ROUTE_TIERS)) {
    if (pathname.startsWith(route)) {
      return tier;
    }
  }

  return 'relaxed';
}

export function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  if (result.limit > 0) {
    response.headers.set('X-RateLimit-Limit', result.limit.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', result.reset.toString());
  }
  return response;
}
