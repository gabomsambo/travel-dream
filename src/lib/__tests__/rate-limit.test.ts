import { NextRequest, NextResponse } from 'next/server';

jest.mock('@upstash/ratelimit', () => ({
  Ratelimit: jest.fn().mockImplementation(() => ({
    limit: jest.fn().mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
    }),
  })),
}));

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => ({})),
}));

import {
  getClientIdentifier,
  isBetaTester,
  checkRateLimit,
  getRouteTier,
  rateLimitResponse,
  addRateLimitHeaders,
} from '../rate-limit';

function createMockRequest(options: {
  headers?: Record<string, string>;
  userId?: string;
}): NextRequest {
  const headers = new Headers();
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }

  return {
    headers,
    nextUrl: { pathname: '/api/test' },
  } as unknown as NextRequest;
}

describe('rate-limit', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getClientIdentifier', () => {
    test('returns user ID when provided', () => {
      const req = createMockRequest({ headers: {} });
      expect(getClientIdentifier(req, 'usr_123')).toBe('user:usr_123');
    });

    test('returns IP from cf-connecting-ip header when available', () => {
      const req = createMockRequest({
        headers: { 'cf-connecting-ip': '1.2.3.4' },
      });
      expect(getClientIdentifier(req)).toBe('ip:1.2.3.4');
    });

    test('returns IP from x-real-ip header when cf-connecting-ip not available', () => {
      const req = createMockRequest({
        headers: { 'x-real-ip': '5.6.7.8' },
      });
      expect(getClientIdentifier(req)).toBe('ip:5.6.7.8');
    });

    test('returns IP from x-forwarded-for header (first IP)', () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' },
      });
      expect(getClientIdentifier(req)).toBe('ip:1.2.3.4');
    });

    test('returns "ip:unknown" when no headers available', () => {
      const req = createMockRequest({ headers: {} });
      expect(getClientIdentifier(req)).toBe('ip:unknown');
    });

    test('prioritizes user ID over IP headers', () => {
      const req = createMockRequest({
        headers: { 'cf-connecting-ip': '1.2.3.4' },
      });
      expect(getClientIdentifier(req, 'usr_456')).toBe('user:usr_456');
    });
  });

  describe('isBetaTester', () => {
    test('returns true for listed users', () => {
      process.env.BETA_TESTER_IDS = 'usr_123,usr_456';
      expect(isBetaTester('usr_123')).toBe(true);
      expect(isBetaTester('usr_456')).toBe(true);
    });

    test('returns false for unlisted users', () => {
      process.env.BETA_TESTER_IDS = 'usr_123,usr_456';
      expect(isBetaTester('usr_789')).toBe(false);
    });

    test('returns false when BETA_TESTER_IDS is not set', () => {
      delete process.env.BETA_TESTER_IDS;
      expect(isBetaTester('usr_123')).toBe(false);
    });

    test('handles whitespace in BETA_TESTER_IDS', () => {
      process.env.BETA_TESTER_IDS = 'usr_123 , usr_456 , usr_789';
      expect(isBetaTester('usr_456')).toBe(true);
    });
  });

  describe('getRouteTier', () => {
    test('returns auth tier for registration route', () => {
      expect(getRouteTier('/api/auth/register')).toBe('auth');
    });

    test('returns strict tier for llm-process route', () => {
      expect(getRouteTier('/api/llm-process')).toBe('strict');
      expect(getRouteTier('/api/llm-process/batch')).toBe('strict');
    });

    test('returns strict tier for upload/process route', () => {
      expect(getRouteTier('/api/upload/process')).toBe('strict');
    });

    test('returns standard tier for upload route', () => {
      expect(getRouteTier('/api/upload')).toBe('standard');
    });

    test('returns standard tier for google-places routes', () => {
      expect(getRouteTier('/api/google-places/autocomplete')).toBe('standard');
      expect(getRouteTier('/api/google-places/details')).toBe('standard');
    });

    test('returns relaxed tier for unknown routes', () => {
      expect(getRouteTier('/api/some-other-route')).toBe('relaxed');
    });

    test('returns relaxed tier for beta testers regardless of route', () => {
      process.env.BETA_TESTER_IDS = 'usr_beta';
      expect(getRouteTier('/api/llm-process', 'usr_beta')).toBe('relaxed');
      expect(getRouteTier('/api/auth/register', 'usr_beta')).toBe('relaxed');
    });
  });

  describe('checkRateLimit', () => {
    test('returns success when Redis unavailable (graceful degradation)', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const result = await checkRateLimit('test', 'strict');
      expect(result.success).toBe(true);
    });
  });

  describe('rateLimitResponse', () => {
    test('returns 429 status with proper headers', () => {
      const result = {
        success: false,
        limit: 5,
        remaining: 0,
        reset: Date.now() + 60000,
      };

      const response = rateLimitResponse(result);
      expect(response.status).toBe(429);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(response.headers.get('Retry-After')).toBeDefined();
    });

    test('includes error message in response body', async () => {
      const result = {
        success: false,
        limit: 5,
        remaining: 0,
        reset: Date.now() + 60000,
      };

      const response = rateLimitResponse(result);
      const body = await response.json();
      expect(body.error).toBe('Too many requests');
      expect(body.message).toContain('Rate limit exceeded');
    });
  });
});
