/**
 * @jest-environment node
 */

process.env.GOOGLE_PLACES_API_KEY = 'test-google-key';

import googleAdapter, {
  fetchPlacePhotos,
  searchPlacesWithPhotos,
  GooglePlacesApiError,
} from '@/lib/photo-sources/google-places';
import { RateLimitError } from '@/lib/photo-sources/types';

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

describe('google-places backfill lookups', () => {
  const photo = {
    name: 'places/gpl_a/photos/P1',
    widthPx: 1000,
    heightPx: 700,
    authorAttributions: [{ displayName: 'Ann', uri: 'https://maps.google.com/contrib/9' }],
  };

  it('fetchPlacePhotos returns photo references without any Place Photos call', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({
        id: 'gpl_a',
        displayName: { text: 'Plaza Mayor' },
        location: { latitude: 40.4, longitude: -3.7 },
        types: ['tourist_attraction'],
        photos: [photo],
      }),
    );

    const place = await fetchPlacePhotos('gpl_a');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places/gpl_a?languageCode=en');
    expect(init.headers['X-Goog-FieldMask']).toBe('id,displayName,location,types,photos');
    expect(place).toMatchObject({
      googlePlaceId: 'gpl_a',
      displayName: 'Plaza Mayor',
      location: { lat: 40.4, lon: -3.7 },
      types: ['tourist_attraction'],
    });
    expect(place.photos[0]).toEqual({
      source: 'google_places',
      sourceId: 'places/gpl_a/photos/P1',
      thumbnailUrl: null,
      fullUrl: null,
      width: 1000,
      height: 700,
      attribution: {
        kind: 'google_places',
        authorAttributions: [{ displayName: 'Ann', uri: 'https://maps.google.com/contrib/9' }],
      },
    });
  });

  it('searchPlacesWithPhotos posts a location-biased Text Search with a Pro-only field mask', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ places: [{ id: 'gpl_a', displayName: { text: 'Plaza Mayor' }, photos: [photo] }] }),
    );

    const results = await searchPlacesWithPhotos('Plaza Mayor, Madrid', { lat: 40.4, lon: -3.7 });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Goog-FieldMask']).toBe(
      'places.id,places.displayName,places.location,places.formattedAddress,places.types,places.photos',
    );
    expect(JSON.parse(init.body)).toMatchObject({
      textQuery: 'Plaza Mayor, Madrid',
      locationBias: { circle: { center: { latitude: 40.4, longitude: -3.7 } } },
    });
    expect(results[0].photos[0].sourceId).toBe('places/gpl_a/photos/P1');
  });

  it('surfaces 429 as RateLimitError and other failures with their status', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ...jsonResponse({}, { status: 429 }), headers: { get: () => '7' } })
      .mockResolvedValueOnce(jsonResponse({}, { status: 404 }));

    await expect(fetchPlacePhotos('gpl_a')).rejects.toBeInstanceOf(RateLimitError);
    const err = await fetchPlacePhotos('gpl_a').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GooglePlacesApiError);
    expect((err as GooglePlacesApiError).status).toBe(404);
  });
});
