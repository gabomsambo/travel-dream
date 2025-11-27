import type { Place } from '@/types/database';
import {
  type DuplicateDetectionConfig,
  type DuplicateDetectionResult,
  DEFAULT_DETECTION_CONFIG,
  detectDuplicates,
  calculateNameSimilarity
} from './duplicate-detection';

interface SpatialIndex {
  byCityKey: Map<string, Place[]>;
  byGeoBucket: Map<string, Place[]>;
}

interface NameIndex {
  byPrefix: Map<string, Place[]>;
}

function normalizeNameForComparison(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/^(the|la|le|el|basilica de|basílica de|church of|cathedral of|temple of)\s+/i, '')
    .replace(/\s+(church|cathedral|basilica|basílica|temple|mosque)$/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSpatialIndex(places: Place[]): SpatialIndex {
  const byCityKey = new Map<string, Place[]>();
  const byGeoBucket = new Map<string, Place[]>();

  for (const place of places) {
    const cityKey = place.city?.toLowerCase().trim() || 'NO_CITY';

    if (!byCityKey.has(cityKey)) {
      byCityKey.set(cityKey, []);
    }
    byCityKey.get(cityKey)!.push(place);

    if (place.coords && typeof place.coords.lat === 'number' && typeof place.coords.lon === 'number') {
      const latBucket = Math.floor(place.coords.lat / 0.01);
      const lonBucket = Math.floor(place.coords.lon / 0.01);
      const geoKey = `geo_${latBucket}_${lonBucket}`;

      if (!byGeoBucket.has(geoKey)) {
        byGeoBucket.set(geoKey, []);
      }
      byGeoBucket.get(geoKey)!.push(place);
    }
  }

  return { byCityKey, byGeoBucket };
}

function buildNameIndex(places: Place[]): NameIndex {
  const byPrefix = new Map<string, Place[]>();

  for (const place of places) {
    const normalized = normalizeNameForComparison(place.name);
    // Use 2-char prefix for broader matching (more recall)
    const prefix = normalized.slice(0, 2);

    if (prefix.length >= 2) {
      if (!byPrefix.has(prefix)) {
        byPrefix.set(prefix, []);
      }
      byPrefix.get(prefix)!.push(place);
    }
  }

  return { byPrefix };
}

function getCandidatesForPlace(
  place: Place,
  spatialIndex: SpatialIndex,
  nameIndex: NameIndex,
  config: DuplicateDetectionConfig
): Place[] {
  const candidates = new Set<Place>();

  // Strategy 1: Same city (most restrictive, highest signal)
  const cityKey = place.city?.toLowerCase().trim() || 'NO_CITY';
  const cityPlaces = spatialIndex.byCityKey.get(cityKey) || [];

  // Strategy 2: Geo proximity (if has coords)
  if (place.coords && typeof place.coords.lat === 'number' && typeof place.coords.lon === 'number') {
    const latBucket = Math.floor(place.coords.lat / 0.01);
    const lonBucket = Math.floor(place.coords.lon / 0.01);

    // Check 9 buckets (center + 8 neighbors) for ~3km radius
    for (let dlat = -1; dlat <= 1; dlat++) {
      for (let dlon = -1; dlon <= 1; dlon++) {
        const geoKey = `geo_${latBucket + dlat}_${lonBucket + dlon}`;
        const geoPlaces = spatialIndex.byGeoBucket.get(geoKey) || [];
        geoPlaces.forEach(p => candidates.add(p));
      }
    }
  }

  // Strategy 3: Name similarity (2-char prefix for broader matching)
  // FIXED: Include ALL name matches regardless of city to catch cross-city duplicates
  // (e.g., "Monaco" with city="Monaco" vs city=null should be compared)
  const normalized = normalizeNameForComparison(place.name);
  if (normalized.length >= 2) {
    const prefix = normalized.slice(0, 2);
    const namePlaces = nameIndex.byPrefix.get(prefix) || [];
    namePlaces.forEach(p => candidates.add(p));
  }

  // Add all city places as baseline
  cityPlaces.forEach(p => candidates.add(p));

  candidates.delete(place);
  return Array.from(candidates);
}

export async function optimizedBatchDetectDuplicates(
  places: Place[],
  config: DuplicateDetectionConfig = DEFAULT_DETECTION_CONFIG,
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, DuplicateDetectionResult>> {
  const results = new Map<string, DuplicateDetectionResult>();

  const spatialIndex = buildSpatialIndex(places);
  const nameIndex = buildNameIndex(places);

  for (let i = 0; i < places.length; i++) {
    const place = places[i];

    const candidates = getCandidatesForPlace(place, spatialIndex, nameIndex, config);

    const result = detectDuplicates(place, candidates, config);
    results.set(place.id, result);

    if (onProgress) {
      onProgress(i + 1, places.length);
    }
  }

  return results;
}
