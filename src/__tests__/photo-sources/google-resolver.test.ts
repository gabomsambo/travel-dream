/**
 * @jest-environment node
 */
jest.mock('server-only', () => ({}));

process.env.GOOGLE_PLACES_API_KEY = 'test-google-key';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

import { resolveGooglePhoto } from '@/lib/photo-sources/google-resolver';

const EXPIRED = 'places/ChIJplace/photos/OLD';

function res(status: number, body: unknown = {}) {
  return { ok: status < 400, status, json: async () => body };
}

const details = {
  photos: [
    { name: 'places/ChIJplace/photos/FIRST', widthPx: 800, heightPx: 600, authorAttributions: [{ displayName: 'Ann', uri: 'https://maps.google.com/contrib/ann' }] },
    { name: 'places/ChIJplace/photos/JULIO', widthPx: 1200, heightPx: 900, authorAttributions: [{ displayName: 'Julio', uri: 'https://maps.google.com/contrib/julio' }] },
  ],
};

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch;
});

describe('resolveGooglePhoto', () => {
  it('returns the photo URI for a live name without refreshing', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(res(200, { photoUri: 'https://lh3/live' }));
    await expect(resolveGooglePhoto('places/p/photos/x', 400)).resolves.toEqual({ photoUri: 'https://lh3/live' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('heals an expired name with a free IDs-only Place Details call, preferring the same contributor', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(res(400, { error: { message: 'The photo resource in the request is invalid.' } }))
      .mockResolvedValueOnce(res(200, details))
      .mockResolvedValueOnce(res(200, { photoUri: 'https://lh3/fresh' }));

    const out = await resolveGooglePhoto(EXPIRED, 400, 'https://maps.google.com/contrib/julio');

    expect(out).toEqual({
      photoUri: 'https://lh3/fresh',
      refreshed: {
        name: 'places/ChIJplace/photos/JULIO',
        widthPx: 1200,
        heightPx: 900,
        authorAttributions: [{ displayName: 'Julio', uri: 'https://maps.google.com/contrib/julio' }],
      },
    });
    const [detailsUrl, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect(detailsUrl).toBe('https://places.googleapis.com/v1/places/ChIJplace');
    expect(init.headers['X-Goog-FieldMask']).toBe('photos');
    expect((global.fetch as jest.Mock).mock.calls[2][0]).toContain('places/ChIJplace/photos/JULIO/media');
  });

  it("falls back to the place's first photo when the contributor is gone", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(res(400))
      .mockResolvedValueOnce(res(200, details))
      .mockResolvedValueOnce(res(200, { photoUri: 'https://lh3/fresh' }));
    const out = await resolveGooglePhoto(EXPIRED, 400, 'https://maps.google.com/contrib/nobody');
    expect(out?.refreshed?.name).toBe('places/ChIJplace/photos/FIRST');
  });

  it('gives up without a replacement when the refresh fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(res(400)).mockResolvedValueOnce(res(403));
    await expect(resolveGooglePhoto(EXPIRED, 400)).resolves.toBeNull();
  });

  it('gives up when the place has no photos left', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(res(400)).mockResolvedValueOnce(res(200, {}));
    await expect(resolveGooglePhoto(EXPIRED, 400)).resolves.toBeNull();
  });

  it('does not refresh on a failure other than 400', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(res(503));
    await expect(resolveGooglePhoto(EXPIRED, 400)).resolves.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
