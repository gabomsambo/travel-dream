/**
 * @jest-environment node
 */

import pexelsAdapter from '@/lib/photo-sources/pexels';
import { ConfigError, RateLimitError } from '@/lib/photo-sources/types';

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    statusText: 'OK',
    json: async () => body,
    headers: {
      get: (k: string) => init.headers?.[k.toLowerCase()] ?? init.headers?.[k] ?? null,
    },
  };
}

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch;
});

afterEach(() => {
  jest.resetAllMocks();
  delete process.env.PEXELS_API_KEY;
});

describe('pexels adapter', () => {
  it('throws ConfigError when PEXELS_API_KEY is unset (does NOT throw at module import)', async () => {
    delete process.env.PEXELS_API_KEY;
    await expect(
      pexelsAdapter.search({ query: 'paris', placeId: 'plc_1' }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it('returns mapped items on happy path with raw Authorization header', async () => {
    process.env.PEXELS_API_KEY = 'test-pexels-key';
    const payload = {
      photos: [
        {
          id: 12345,
          width: 5184,
          height: 3456,
          url: 'https://www.pexels.com/photo/eiffel-12345/',
          photographer: 'Pixabay',
          photographer_url: 'https://www.pexels.com/@pixabay',
          alt: 'Eiffel Tower',
          src: {
            medium: 'https://images.pexels.com/photos/12345/photo-medium.jpg',
            large: 'https://images.pexels.com/photos/12345/photo-large.jpg',
            large2x: 'https://images.pexels.com/photos/12345/photo-large2x.jpg',
            original: 'https://images.pexels.com/photos/12345/photo-original.jpg',
          },
        },
      ],
      next_page: 'https://api.pexels.com/v1/search/?page=2',
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(payload));

    const result = await pexelsAdapter.search({ query: 'paris', placeId: 'plc_1' });

    expect(result.items).toHaveLength(1);
    const it = result.items[0];
    expect(it.source).toBe('pexels');
    expect(it.sourceId).toBe('12345');
    expect(it.fullUrl).toBe('https://images.pexels.com/photos/12345/photo-large2x.jpg');
    expect(it.attribution.kind).toBe('pexels');
    if (it.attribution.kind === 'pexels') {
      expect(it.attribution.photographer).toBe('Pixabay');
      expect(it.attribution.photoUrl).toContain('eiffel-12345');
    }
    expect(result.nextPage).toBe(2);

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[1].headers.Authorization).toBe('test-pexels-key'); // raw, no Bearer
  });

  it('throws RateLimitError on 429 with x-ratelimit-reset', async () => {
    process.env.PEXELS_API_KEY = 'test';
    const future = Math.floor(Date.now() / 1000) + 60;
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({}, {
        status: 429,
        headers: { 'x-ratelimit-reset': String(future) },
      }),
    );
    await expect(
      pexelsAdapter.search({ query: 'x', placeId: 'plc_1' }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});
