/**
 * @jest-environment node
 */

process.env.GOOGLE_PLACES_API_KEY = 'test-google-key';

import googleAdapter from '@/lib/photo-sources/google-places';

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    statusText: 'OK',
    json: async () => body,
    headers: { get: () => null },
  };
}

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch;
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('google-places adapter', () => {
  it('throws when googlePlaceId is missing', async () => {
    await expect(
      googleAdapter.search({ query: 'whatever', placeId: 'plc_1' }),
    ).rejects.toThrow(/googlePlaceId/);
  });

  it('captures sourceId, authorAttributions, and resolves thumb URLs', async () => {
    const detailsBody = {
      id: 'gpl_test',
      displayName: { text: 'Sample Place' },
      photos: [
        {
          name: 'places/gpl_test/photos/PHOTO_1',
          widthPx: 1200,
          heightPx: 800,
          authorAttributions: [
            { displayName: 'Jane Doe', uri: 'https://maps.google.com/contrib/1' },
          ],
        },
        {
          name: 'places/gpl_test/photos/PHOTO_2',
          widthPx: 1200,
          heightPx: 800,
          authorAttributions: [],
        },
      ],
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(detailsBody))
      .mockResolvedValueOnce(
        jsonResponse({ name: 'x', photoUri: 'https://lh3.googleusercontent.com/photo1' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ name: 'x', photoUri: 'https://lh3.googleusercontent.com/photo2' }),
      );

    const result = await googleAdapter.search({
      query: 'ignored',
      placeId: 'plc_internal',
      googlePlaceId: 'gpl_test',
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].sourceId).toBe('places/gpl_test/photos/PHOTO_1');
    expect(result.items[0].thumbnailUrl).toBe('https://lh3.googleusercontent.com/photo1');
    if (result.items[0].attribution.kind === 'google_places') {
      expect(result.items[0].attribution.authorAttributions[0].displayName).toBe('Jane Doe');
    }
    expect(result.nextPage).toBeNull();

    const detailsCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(detailsCall[1].headers['X-Goog-Api-Key']).toBe('test-google-key');
    expect(detailsCall[1].headers['X-Goog-FieldMask']).toBe('id,displayName,photos');
  });

  it('returns empty when Place Details has no photos', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ id: 'x', displayName: { text: 'No photos' } }),
    );
    const result = await googleAdapter.search({
      query: 'x',
      placeId: 'plc_1',
      googlePlaceId: 'gpl_x',
    });
    expect(result.items).toEqual([]);
  });
});
