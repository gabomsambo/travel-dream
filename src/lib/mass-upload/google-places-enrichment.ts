import { parseAddressComponents } from '@/lib/address-parser';
import type { GeminiExtractedPlace, PipelinePlace } from '@/types/extraction-pipeline';

// ─── Internal Types ───────────────────────────────────────────────────────────

interface GoogleEnrichmentResult {
  googlePlaceId: string;
  coords: { lat: number; lon: number };
  address: string;
  city?: string;
  country?: string;
  admin?: string;
}

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Places enriched at once. Small on purpose: this multiplies with the number of
 *  screenshots a run processes in parallel and with the number of parallel runs. */
const ENRICH_CONCURRENCY = Number(process.env.MASS_UPLOAD_ENRICH_CONCURRENCY ?? 3);
/** Pacing between calls issued by one enrichment lane. */
const RATE_LIMIT_MS = Number(process.env.MASS_UPLOAD_ENRICH_PACING_MS ?? 200);
/** Retries for a transient Google failure before giving up on the screenshot. */
const TRANSIENT_RETRIES = 2;
const REQUEST_TIMEOUT_MS = Number(process.env.MASS_UPLOAD_ENRICH_TIMEOUT_MS ?? 10_000);

/** Google statuses that mean "asked correctly, nothing matched". */
const DEFINITIVE_EMPTY_STATUSES = new Set(['ZERO_RESULTS', 'NOT_FOUND']);
/** Google statuses that mean "try again later" — never a verdict about the place. */
const TRANSIENT_STATUSES = new Set(['OVER_QUERY_LIMIT', 'UNKNOWN_ERROR', 'RESOURCE_EXHAUSTED']);

/**
 * Google could not answer — the call failed rather than reporting "no match".
 * Callers must treat this as an interrupted run, not as a place without coords:
 * silently degrading here is what produced plausible-looking but wrong records.
 */
export class GooglePlacesUnavailableError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'GooglePlacesUnavailableError';
  }
}

// ─── Service Class ────────────────────────────────────────────────────────────

export class GooglePlacesEnrichmentService {
  private apiKey: string;
  /**
   * Keyed by name|city|country and holding the in-flight promise, so parallel
   * lanes asking for the same place share one lookup instead of racing.
   */
  private cache: Map<string, Promise<GoogleEnrichmentResult | null>>;

  constructor(config?: { apiKey?: string }) {
    const apiKey = config?.apiKey || process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY is required');
    }
    this.apiKey = apiKey;
    this.cache = new Map();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Enrich a screenshot's places. Runs `ENRICH_CONCURRENCY` lookups at a time and
   * preserves input order. Throws `GooglePlacesUnavailableError` if Google itself
   * is unavailable, so the caller can retry the screenshot instead of persisting
   * half-enriched places.
   */
  async enrichPlaces(places: GeminiExtractedPlace[], signal?: AbortSignal): Promise<PipelinePlace[]> {
    this.cache = new Map();
    const enriched: PipelinePlace[] = new Array(places.length);
    let cursor = 0;

    const lane = async (): Promise<void> => {
      while (cursor < places.length) {
        const index = cursor++;
        signal?.throwIfAborted();
        enriched[index] = await this.enrichOne(places[index], signal);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(ENRICH_CONCURRENCY, places.length) }, () => lane())
    );

    return enriched;
  }

  // ── Private Methods ─────────────────────────────────────────────────────────

  private async enrichOne(place: GeminiExtractedPlace, signal?: AbortSignal): Promise<PipelinePlace> {
    const base: PipelinePlace = {
      ...place,
      coords: null,
      address: null,
      googlePlaceId: null,
    };

    // Skip conditions — from test script + implementation plan
    if (!place.name || (!place.city && !place.country)) {
      return base;
    }
    if (place.confidence < 0.3) return base;
    if (place.kind === 'tip') return base;

    const cacheKey = this.buildCacheKey(place.name, place.city, place.country);
    let lookup = this.cache.get(cacheKey);
    if (!lookup) {
      lookup = this.lookup(place, signal);
      this.cache.set(cacheKey, lookup);
      // A failed lookup must not be remembered as an answer.
      lookup.catch(() => this.cache.delete(cacheKey));
    }

    // A transient Google outage propagates: the screenshot is retried later
    // rather than stored as a place Google never actually confirmed.
    return this.applyEnrichment(base, await lookup);
  }

  private async lookup(
    place: GeminiExtractedPlace,
    signal?: AbortSignal
  ): Promise<GoogleEnrichmentResult | null> {
    const placeId = await this.autocomplete(place, signal);
    if (!placeId) return null;
    return await this.getDetails(placeId, signal);
  }

  private async autocomplete(place: GeminiExtractedPlace, signal?: AbortSignal): Promise<string | null> {
    const queryParts = [place.name];
    if (place.city) queryParts.push(place.city);
    if (place.country) queryParts.push(place.country);
    const query = queryParts.join(', ');

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', query);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('types', 'establishment|geocode');

    const data = await this.callGoogle<{ predictions?: Array<{ place_id: string }> }>(
      url,
      `autocomplete "${query}"`,
      signal
    );
    if (!data) return null;

    return data.predictions?.[0]?.place_id ?? null;
  }

  private async getDetails(placeId: string, signal?: AbortSignal): Promise<GoogleEnrichmentResult | null> {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set(
      'fields',
      'place_id,name,formatted_address,geometry,address_components,opening_hours'
    );

    const data = await this.callGoogle<{
      result?: {
        place_id: string;
        formatted_address?: string;
        geometry?: { location: { lat: number; lng: number } };
        address_components?: AddressComponent[];
      };
    }>(url, `details ${placeId}`, signal);

    if (!data?.result) return null;

    const r = data.result;

    const parsed = r.address_components
      ? parseAddressComponents(r.address_components, r.formatted_address)
      : null;

    return {
      googlePlaceId: r.place_id,
      // Google returns { lat, lng } but PipelinePlace uses { lat, lon }
      coords: r.geometry?.location
        ? { lat: r.geometry.location.lat, lon: r.geometry.location.lng }
        : { lat: 0, lon: 0 },
      address: r.formatted_address || '',
      city: parsed?.city ?? undefined,
      country: parsed?.country ?? undefined,
      admin: parsed?.admin ?? undefined,
    };
  }

  /**
   * One Google call with explicit failure handling.
   *
   * Returns the payload on success, `null` when Google definitively reports no
   * match, and throws `GooglePlacesUnavailableError` when the call itself failed
   * (non-2xx, unparseable body, quota, timeout). The old code read `res.json()`
   * without checking `res.ok`, so an error page or a quota rejection looked
   * exactly like "this place does not exist".
   */
  private async callGoogle<T extends object>(
    url: URL,
    label: string,
    signal?: AbortSignal
  ): Promise<(T & { status?: string }) | null> {
    let lastError: string = 'unknown error';

    for (let attempt = 0; attempt <= TRANSIENT_RETRIES; attempt++) {
      signal?.throwIfAborted();
      if (attempt > 0) await this.sleep(500 * 2 ** (attempt - 1));
      await this.sleep(RATE_LIMIT_MS);

      let res: Response;
      try {
        res = await fetch(url.toString(), {
          signal: AbortSignal.any(
            [signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)].filter((s): s is AbortSignal => Boolean(s))
          ),
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = `network error: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        // 4xx other than 429 will not get better by retrying.
        if (res.status !== 429 && res.status < 500) break;
        continue;
      }

      let data: (T & { status?: string }) | null = null;
      try {
        data = (await res.json()) as T & { status?: string };
      } catch (err) {
        lastError = `unparseable response: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }

      const status = data?.status;
      if (!status || status === 'OK') return data;
      if (DEFINITIVE_EMPTY_STATUSES.has(status)) return null;
      if (TRANSIENT_STATUSES.has(status)) {
        lastError = `Google status ${status}`;
        continue;
      }
      // REQUEST_DENIED / INVALID_REQUEST — misconfiguration, not a missing place.
      lastError = `Google status ${status}`;
      break;
    }

    throw new GooglePlacesUnavailableError(
      `Google Places unavailable for ${label}: ${lastError}`,
      lastError
    );
  }

  private applyEnrichment(
    base: PipelinePlace,
    result: GoogleEnrichmentResult | null
  ): PipelinePlace {
    if (!result) return base;

    base.coords = result.coords;
    base.address = result.address;
    base.googlePlaceId = result.googlePlaceId;

    // Backfill only — NEVER overwrite non-null Gemini values
    if (!base.city && result.city) base.city = result.city;
    if (!base.country && result.country) base.country = result.country;
    if (!base.admin && result.admin) base.admin = result.admin;

    return base;
  }

  private buildCacheKey(
    name: string,
    city: string | null,
    country: string | null
  ): string {
    return `${name}|${city || ''}|${country || ''}`.toLowerCase();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Singleton (lazy to avoid build-time env var errors) ─────────────────────

let _googlePlacesInstance: GooglePlacesEnrichmentService | null = null;
export function getGooglePlacesEnrichmentService() {
  if (!_googlePlacesInstance) _googlePlacesInstance = new GooglePlacesEnrichmentService();
  return _googlePlacesInstance;
}
