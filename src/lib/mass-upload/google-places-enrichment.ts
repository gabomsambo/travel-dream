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

const RATE_LIMIT_MS = 200;

// ─── Service Class ────────────────────────────────────────────────────────────

export class GooglePlacesEnrichmentService {
  private apiKey: string;
  private cache: Map<string, GoogleEnrichmentResult | null>;

  constructor(config?: { apiKey?: string }) {
    const apiKey = config?.apiKey || process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY is required');
    }
    this.apiKey = apiKey;
    this.cache = new Map();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async enrichPlaces(places: GeminiExtractedPlace[]): Promise<PipelinePlace[]> {
    this.cache = new Map();
    const enriched: PipelinePlace[] = [];
    for (const place of places) {
      enriched.push(await this.enrichOne(place));
    }
    return enriched;
  }

  // ── Private Methods ─────────────────────────────────────────────────────────

  private async enrichOne(place: GeminiExtractedPlace): Promise<PipelinePlace> {
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

    // Cache check
    const cacheKey = this.buildCacheKey(place.name, place.city, place.country);
    if (this.cache.has(cacheKey)) {
      return this.applyEnrichment(base, this.cache.get(cacheKey)!);
    }

    try {
      const placeId = await this.autocomplete(place);
      if (!placeId) {
        this.cache.set(cacheKey, null);
        return base;
      }

      const result = await this.getDetails(placeId);
      if (!result) {
        this.cache.set(cacheKey, null);
        return base;
      }

      this.cache.set(cacheKey, result);
      return this.applyEnrichment(base, result);
    } catch (err) {
      console.warn(
        `[GooglePlaces] Error enriching "${place.name}": ${err instanceof Error ? err.message : err}`
      );
      this.cache.set(cacheKey, null);
      return base;
    }
  }

  private async autocomplete(place: GeminiExtractedPlace): Promise<string | null> {
    const queryParts = [place.name];
    if (place.city) queryParts.push(place.city);
    if (place.country) queryParts.push(place.country);
    const query = queryParts.join(', ');

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', query);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('types', 'establishment|geocode');

    await this.sleep(RATE_LIMIT_MS);
    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      predictions?: Array<{ place_id: string }>;
      status: string;
    };

    return data.predictions?.[0]?.place_id ?? null;
  }

  private async getDetails(placeId: string): Promise<GoogleEnrichmentResult | null> {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set(
      'fields',
      'place_id,name,formatted_address,geometry,address_components,opening_hours'
    );

    await this.sleep(RATE_LIMIT_MS);
    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      result?: {
        place_id: string;
        formatted_address?: string;
        geometry?: { location: { lat: number; lng: number } };
        address_components?: AddressComponent[];
      };
      status: string;
    };

    if (!data.result) return null;

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
