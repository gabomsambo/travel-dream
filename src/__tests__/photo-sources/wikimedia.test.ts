/**
 * @jest-environment node
 */

import wikimediaAdapter from '@/lib/photo-sources/wikimedia';
import { RateLimitError } from '@/lib/photo-sources/types';

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    statusText: init.status === 429 ? 'Too Many Requests' : 'OK',
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
});

describe('wikimedia adapter', () => {
  it('returns valid items, drops SVG and unknown-license entries', async () => {
    const payload = {
      query: {
        pages: [
          {
            pageid: 100,
            title: 'File:Eiffel.jpg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Eiffel.jpg',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Eiffel.jpg',
                thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Eiffel.jpg/300px-Eiffel.jpg',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Eiffel.jpg',
                mime: 'image/jpeg',
                width: 4000,
                height: 3000,
                extmetadata: {
                  Artist: { value: '<a href="x">Jane Doe</a>' },
                  LicenseShortName: { value: 'CC BY-SA 3.0' },
                  LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/3.0' },
                  ImageDescription: { value: 'Tower at sunset' },
                },
              },
            ],
          },
          {
            pageid: 101,
            title: 'File:Map.svg',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Map.svg',
                mime: 'image/svg+xml',
                width: 100,
                height: 100,
                extmetadata: {
                  LicenseShortName: { value: 'CC BY 4.0' },
                },
              },
            ],
          },
          {
            pageid: 102,
            title: 'File:Mystery.jpg',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/wikipedia/commons/x/Mystery.jpg',
                mime: 'image/jpeg',
                width: 100,
                height: 100,
                extmetadata: {
                  // Empty short name → 'unknown' family → skipped
                  LicenseShortName: { value: '' },
                },
              },
            ],
          },
        ],
      },
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(payload));

    const result = await wikimediaAdapter.search({ query: 'Eiffel', placeId: 'plc_1' });
    expect(result.items).toHaveLength(1);
    const it = result.items[0];
    expect(it.source).toBe('wikimedia');
    expect(it.sourceId).toBe('100');
    expect(it.thumbnailUrl).toContain('300px');
    expect(it.attribution.kind).toBe('wikimedia');
    if (it.attribution.kind === 'wikimedia') {
      expect(it.attribution.authorText).toBe('Jane Doe'); // HTML stripped
      expect(it.attribution.licenseShortName).toBe('CC BY-SA 3.0');
      expect(it.attribution.licenseUrl).toBe('https://creativecommons.org/licenses/by-sa/3.0');
      expect(it.attribution.descriptionUrl).toContain('Eiffel.jpg');
    }
  });

  it('throws RateLimitError on 429', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({}, { status: 429, headers: { 'retry-after': '12' } }),
    );
    await expect(
      wikimediaAdapter.search({ query: 'x', placeId: 'plc_1' }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('sets descriptive User-Agent header', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ query: { pages: [] } }),
    );
    await wikimediaAdapter.search({ query: 'paris', placeId: 'plc_1' });
    const call = (global.fetch as jest.Mock).mock.calls[0];
    const headers = call[1]?.headers ?? {};
    expect(headers['User-Agent']).toMatch(/TravelDreams/);
  });
});
