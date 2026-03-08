/**
 * @jest-environment node
 */

// ── Mock address-parser (BEFORE imports) ──────────────────────────────
// We control what parseAddressComponents returns per-test via mockReturnValue.
const mockParseAddressComponents = jest.fn();

jest.mock('@/lib/address-parser', () => ({
  parseAddressComponents: (...args: unknown[]) => mockParseAddressComponents(...args),
}));

// ── Import AFTER mock setup ────────────────────────────────────────────
import { GooglePlacesEnrichmentService } from '@/lib/mass-upload/google-places-enrichment';
import type { GeminiExtractedPlace } from '@/types/extraction-pipeline';

// ── Fixture Factories ──────────────────────────────────────────────────

function makePlace(overrides: Partial<GeminiExtractedPlace> = {}): GeminiExtractedPlace {
  return {
    name: 'Shibuya Crossing',
    kind: 'landmark',
    city: 'Tokyo',
    country: 'Japan',
    admin: null,
    description: 'Famous scramble crossing',
    tags: ['landmark', 'urban'],
    vibes: ['busy'],
    confidence: 0.9,
    price_level: null,
    best_time: null,
    activities: null,
    cuisine: null,
    amenities: null,
    practicalInfo: null,
    recommendedBy: null,
    ...overrides,
  };
}

// Autocomplete response that returns a single prediction
function makeAutocompleteResponse(placeId = 'ChIJ_test_id') {
  return {
    predictions: [{ place_id: placeId }],
    status: 'OK',
  };
}

// Details response with a full result
function makeDetailsResponse(overrides: Record<string, unknown> = {}) {
  return {
    result: {
      place_id: 'ChIJ_test_id',
      formatted_address: '2 Chome-2-1 Dogenzaka, Shibuya City, Tokyo 150-0043, Japan',
      geometry: { location: { lat: 35.6595, lng: 139.7004 } },
      address_components: [
        { long_name: 'Tokyo', short_name: 'Tokyo', types: ['locality', 'political'] },
        { long_name: 'Japan', short_name: 'JP', types: ['country', 'political'] },
        {
          long_name: 'Shibuya City',
          short_name: 'Shibuya',
          types: ['administrative_area_level_2', 'political'],
        },
      ],
      ...overrides,
    },
    status: 'OK',
  };
}

// Default parsed address returned by the mocked parseAddressComponents
const DEFAULT_PARSED = {
  city: 'Tokyo',
  country: 'Japan',
  admin: 'Shibuya City',
  address: '2 Chome-2-1 Dogenzaka, Shibuya City, Tokyo 150-0043, Japan',
  postalCode: '150-0043',
};

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Sets up global.fetch to return autocomplete then details responses in
 * sequence, matching the two-call pattern used by enrichOne().
 */
function mockFetchSequence(
  autocompletePayload: unknown,
  detailsPayload: unknown
) {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce({ json: async () => autocompletePayload })
    .mockResolvedValueOnce({ json: async () => detailsPayload });
}

// ── Test Suite ─────────────────────────────────────────────────────────

describe('GooglePlacesEnrichmentService', () => {
  let service: GooglePlacesEnrichmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Install a fresh fetch mock on the global scope
    global.fetch = jest.fn();

    // Default parseAddressComponents return value — individual tests override
    mockParseAddressComponents.mockReturnValue(DEFAULT_PARSED);

    service = new GooglePlacesEnrichmentService({ apiKey: 'test-api-key' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Skip Conditions ────────────────────────────────────────────────────

  describe('skip conditions', () => {
    it('skips a place whose confidence is below 0.3', async () => {
      const place = makePlace({ confidence: 0.2 });

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(global.fetch).not.toHaveBeenCalled();
      expect(results[0].googlePlaceId).toBeNull();
      expect(results[0].coords).toBeNull();
      expect(results[0].address).toBeNull();
    });

    it('skips a place whose confidence is exactly 0.3 (boundary — should NOT skip)', async () => {
      const place = makePlace({ confidence: 0.3 });
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      // fetch must have been called — the place was not skipped
      expect(global.fetch).toHaveBeenCalled();
      expect(results[0].googlePlaceId).toBe('ChIJ_test_id');
    });

    it('skips a place with kind === "tip"', async () => {
      const place = makePlace({ kind: 'tip' });

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(global.fetch).not.toHaveBeenCalled();
      expect(results[0].googlePlaceId).toBeNull();
    });

    it('skips a place missing both city and country', async () => {
      const place = makePlace({ city: null, country: null });

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(global.fetch).not.toHaveBeenCalled();
      expect(results[0].googlePlaceId).toBeNull();
    });

    it('does NOT skip a place that has city but no country', async () => {
      const place = makePlace({ country: null });
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(global.fetch).toHaveBeenCalled();
      expect(results[0].googlePlaceId).toBe('ChIJ_test_id');
    });

    it('does NOT skip a place that has country but no city', async () => {
      const place = makePlace({ city: null });
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(global.fetch).toHaveBeenCalled();
      expect(results[0].googlePlaceId).toBe('ChIJ_test_id');
    });
  });

  // ── Happy Path ─────────────────────────────────────────────────────────

  describe('successful enrichment', () => {
    it('returns a place enriched with Google Place ID and coordinates', async () => {
      const place = makePlace();
      mockFetchSequence(makeAutocompleteResponse('ChIJ_shibuya'), makeDetailsResponse({
        place_id: 'ChIJ_shibuya',
        geometry: { location: { lat: 35.6595, lng: 139.7004 } },
      }));

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(results[0].googlePlaceId).toBe('ChIJ_shibuya');
      expect(results[0].coords).toEqual({ lat: 35.6595, lon: 139.7004 });
      expect(results[0].address).toBe('2 Chome-2-1 Dogenzaka, Shibuya City, Tokyo 150-0043, Japan');
    });

    it('maps Google lng to PipelinePlace lon correctly', async () => {
      const place = makePlace();
      mockFetchSequence(
        makeAutocompleteResponse(),
        makeDetailsResponse({ geometry: { location: { lat: 48.8566, lng: 2.3522 } } })
      );

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      // Google returns .lng, PipelinePlace wants .lon
      expect(results[0].coords).toEqual({ lat: 48.8566, lon: 2.3522 });
    });

    it('passes name, city and country as a comma-joined query to the autocomplete URL', async () => {
      const place = makePlace({ name: 'Eiffel Tower', city: 'Paris', country: 'France' });
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      await promise;

      const autocompleteUrl: string = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(autocompleteUrl).toContain('input=Eiffel+Tower%2C+Paris%2C+France');
    });
  });

  // ── Caching ────────────────────────────────────────────────────────────

  describe('caching', () => {
    it('uses the cache for duplicate name|city|country lookups', async () => {
      const placeA = makePlace();
      const placeB = makePlace(); // identical key

      // Only one round of fetch calls expected
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([placeA, placeB]);
      await jest.runAllTimersAsync();
      const results = await promise;

      // fetch called only twice (autocomplete + details), not four times
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(results[0].googlePlaceId).toBe('ChIJ_test_id');
      expect(results[1].googlePlaceId).toBe('ChIJ_test_id');
    });

    it('cache key is case-insensitive', async () => {
      const placeA = makePlace({ name: 'Shibuya Crossing', city: 'Tokyo', country: 'Japan' });
      const placeB = makePlace({ name: 'shibuya crossing', city: 'tokyo', country: 'japan' });

      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([placeA, placeB]);
      await jest.runAllTimersAsync();
      await promise;

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('resets the cache between separate enrichPlaces() calls', async () => {
      const place = makePlace();

      // First call
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());
      const firstPromise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      await firstPromise;

      // Second call — cache cleared, so fetch is called again
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());
      const secondPromise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      await secondPromise;

      expect(global.fetch).toHaveBeenCalledTimes(4); // 2 per enrichPlaces call
    });
  });

  // ── Backfill-Only Logic ────────────────────────────────────────────────

  describe('backfill-only logic (does NOT overwrite Gemini values)', () => {
    it('does NOT overwrite Gemini-provided city with Google city', async () => {
      const place = makePlace({ city: 'Shibuya', country: 'Japan', admin: null });
      mockParseAddressComponents.mockReturnValue({
        ...DEFAULT_PARSED,
        city: 'Tokyo', // Google says "Tokyo", Gemini said "Shibuya"
      });
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(results[0].city).toBe('Shibuya'); // Gemini value preserved
    });

    it('does NOT overwrite Gemini-provided country with Google country', async () => {
      const place = makePlace({ city: 'Tokyo', country: 'JP' }); // Gemini abbreviation
      mockParseAddressComponents.mockReturnValue({
        ...DEFAULT_PARSED,
        country: 'Japan', // Google full name
      });
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(results[0].country).toBe('JP'); // Gemini value preserved
    });

    it('does NOT overwrite Gemini-provided admin with Google admin', async () => {
      const place = makePlace({ admin: 'Kanto' }); // Gemini value
      mockParseAddressComponents.mockReturnValue({
        ...DEFAULT_PARSED,
        admin: 'Shibuya City', // Google value
      });
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(results[0].admin).toBe('Kanto'); // Gemini value preserved
    });

    it('backfills city from Google when Gemini provided null', async () => {
      const place = makePlace({ city: null });
      mockParseAddressComponents.mockReturnValue({ ...DEFAULT_PARSED, city: 'Tokyo' });
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(results[0].city).toBe('Tokyo');
    });

    it('backfills country from Google when Gemini provided null', async () => {
      const place = makePlace({ country: null });
      mockParseAddressComponents.mockReturnValue({ ...DEFAULT_PARSED, country: 'Japan' });
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(results[0].country).toBe('Japan');
    });

    it('backfills admin from Google when Gemini provided null', async () => {
      const place = makePlace({ admin: null });
      mockParseAddressComponents.mockReturnValue({ ...DEFAULT_PARSED, admin: 'Shibuya City' });
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(results[0].admin).toBe('Shibuya City');
    });
  });

  // ── Error Handling ─────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns unenriched place when autocomplete returns no predictions', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ predictions: [], status: 'ZERO_RESULTS' }),
      });

      const place = makePlace();
      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(results[0].googlePlaceId).toBeNull();
      expect(results[0].coords).toBeNull();
      expect(results[0].address).toBeNull();
      // Original Gemini values are untouched
      expect(results[0].city).toBe('Tokyo');
      expect(results[0].country).toBe('Japan');
    });

    it('returns unenriched place when details API returns no result', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ json: async () => makeAutocompleteResponse() })
        .mockResolvedValueOnce({ json: async () => ({ status: 'NOT_FOUND' }) }); // no .result

      const place = makePlace();
      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(results[0].googlePlaceId).toBeNull();
      expect(results[0].coords).toBeNull();
    });

    it('handles a fetch network failure gracefully and returns unenriched place', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const place = makePlace();
      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      // Must not throw — enrichPlaces resolves even when fetch fails
      expect(results).toHaveLength(1);
      expect(results[0].googlePlaceId).toBeNull();
      expect(results[0].coords).toBeNull();
    });

    it('continues processing remaining places after one fails', async () => {
      const placeA = makePlace({ name: 'Failing Place' });
      const placeB = makePlace({ name: 'Succeeding Place', city: 'Osaka', country: 'Japan' });

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('timeout')) // placeA autocomplete fails
        .mockResolvedValueOnce({ json: async () => makeAutocompleteResponse('ChIJ_osaka') }) // placeB autocomplete
        .mockResolvedValueOnce({ json: async () => makeDetailsResponse({ place_id: 'ChIJ_osaka' }) }); // placeB details

      const promise = service.enrichPlaces([placeA, placeB]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(results).toHaveLength(2);
      expect(results[0].googlePlaceId).toBeNull(); // placeA failed
      expect(results[1].googlePlaceId).toBe('ChIJ_osaka'); // placeB succeeded
    });

    it('handles missing geometry in details response (defaults coords to 0,0)', async () => {
      const detailsWithoutGeometry = makeDetailsResponse({ geometry: undefined });
      mockFetchSequence(makeAutocompleteResponse(), detailsWithoutGeometry);

      const place = makePlace();
      const promise = service.enrichPlaces([place]);
      await jest.runAllTimersAsync();
      const results = await promise;

      expect(results[0].googlePlaceId).toBe('ChIJ_test_id');
      expect(results[0].coords).toEqual({ lat: 0, lon: 0 });
    });
  });

  // ── Rate Limiting ──────────────────────────────────────────────────────

  describe('rate-limiting delay', () => {
    it('applies a delay before each fetch call (RATE_LIMIT_MS = 200ms)', async () => {
      const place = makePlace();
      mockFetchSequence(makeAutocompleteResponse(), makeDetailsResponse());

      const promise = service.enrichPlaces([place]);

      // fetch should not have been called yet — timer has not fired
      expect(global.fetch).not.toHaveBeenCalled();

      // Advance past the first 200ms sleep (before autocomplete)
      await jest.advanceTimersByTimeAsync(200);
      expect(global.fetch).toHaveBeenCalledTimes(1); // autocomplete

      // Advance past the second 200ms sleep (before details)
      await jest.advanceTimersByTimeAsync(200);
      expect(global.fetch).toHaveBeenCalledTimes(2); // details

      await promise;
    });

    it('applies two rate-limit delays for each enriched place (one per API call)', async () => {
      const places = [makePlace(), makePlace({ name: 'Different Place', city: 'Osaka' })];

      // First place: autocomplete + details
      mockFetchSequence(makeAutocompleteResponse('ChIJ_first'), makeDetailsResponse({ place_id: 'ChIJ_first' }));
      // Second place: autocomplete + details (different cache key — different name)
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ json: async () => makeAutocompleteResponse('ChIJ_second') })
        .mockResolvedValueOnce({ json: async () => makeDetailsResponse({ place_id: 'ChIJ_second' }) });

      const promise = service.enrichPlaces(places);

      // Before any timers: nothing called
      expect(global.fetch).toHaveBeenCalledTimes(0);

      await jest.advanceTimersByTimeAsync(200); // sleep before 1st autocomplete
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(200); // sleep before 1st details
      expect(global.fetch).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(200); // sleep before 2nd autocomplete
      expect(global.fetch).toHaveBeenCalledTimes(3);

      await jest.advanceTimersByTimeAsync(200); // sleep before 2nd details
      expect(global.fetch).toHaveBeenCalledTimes(4);

      await promise;
    });
  });

  // ── Constructor ────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('throws when no API key is provided and env var is absent', () => {
      const original = process.env.GOOGLE_PLACES_API_KEY;
      delete process.env.GOOGLE_PLACES_API_KEY;

      expect(() => new GooglePlacesEnrichmentService()).toThrow('GOOGLE_PLACES_API_KEY is required');

      process.env.GOOGLE_PLACES_API_KEY = original;
    });

    it('accepts API key from environment variable', () => {
      process.env.GOOGLE_PLACES_API_KEY = 'env-key';
      expect(() => new GooglePlacesEnrichmentService()).not.toThrow();
      delete process.env.GOOGLE_PLACES_API_KEY;
    });
  });
});
