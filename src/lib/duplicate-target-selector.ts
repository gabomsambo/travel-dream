import type { Place } from '@/types/database';

export interface DataCompletenessScore {
  placeId: string;
  score: number; // 0-100
  factors: {
    hasCoords: boolean;      // +15
    hasDescription: boolean; // +10
    hasAddress: boolean;     // +10
    hasTags: boolean;        // +5
    hasVibes: boolean;       // +5
    hasActivities: boolean;  // +5
    hasAmenities: boolean;   // +5
    hasCuisine: boolean;     // +5
    hasAltNames: boolean;    // +5
    hasNotes: boolean;       // +5
    hasPrice: boolean;       // +5
    hasPracticalInfo: boolean; // +5
    isInLibrary: boolean;    // +10
    hasHighConfidence: boolean; // +10
  };
}

export function calculateDataCompleteness(place: Place): DataCompletenessScore {
  const factors = {
    hasCoords: !!(place.coords && typeof place.coords === 'object' &&
                  'lat' in place.coords && 'lon' in place.coords &&
                  place.coords.lat !== null && place.coords.lon !== null),
    hasDescription: !!(place.description?.trim()),
    hasAddress: !!(place.address?.trim()),
    hasTags: Array.isArray(place.tags) && place.tags.length > 0,
    hasVibes: Array.isArray(place.vibes) && place.vibes.length > 0,
    hasActivities: Array.isArray(place.activities) && place.activities.length > 0,
    hasAmenities: Array.isArray(place.amenities) && place.amenities.length > 0,
    hasCuisine: Array.isArray(place.cuisine) && place.cuisine.length > 0,
    hasAltNames: Array.isArray(place.altNames) && place.altNames.length > 0,
    hasNotes: !!(place.notes?.trim()),
    hasPrice: !!(place.price_level?.trim()),
    hasPracticalInfo: !!(place.practicalInfo?.trim()),
    isInLibrary: place.status === 'library',
    hasHighConfidence: (place.confidence ?? 0) > 0.8,
  };

  const score =
    (factors.hasCoords ? 15 : 0) +
    (factors.hasDescription ? 10 : 0) +
    (factors.hasAddress ? 10 : 0) +
    (factors.hasTags ? 5 : 0) +
    (factors.hasVibes ? 5 : 0) +
    (factors.hasActivities ? 5 : 0) +
    (factors.hasAmenities ? 5 : 0) +
    (factors.hasCuisine ? 5 : 0) +
    (factors.hasAltNames ? 5 : 0) +
    (factors.hasNotes ? 5 : 0) +
    (factors.hasPrice ? 5 : 0) +
    (factors.hasPracticalInfo ? 5 : 0) +
    (factors.isInLibrary ? 10 : 0) +
    (factors.hasHighConfidence ? 10 : 0);

  return { placeId: place.id, score, factors };
}

export function recommendMergeTarget(places: Place[]): string {
  if (places.length === 0) {
    throw new Error('Cannot recommend merge target from empty array');
  }
  if (places.length === 1) {
    return places[0].id;
  }

  const scores = places.map(p => calculateDataCompleteness(p));
  scores.sort((a, b) => b.score - a.score);
  return scores[0].placeId;
}

export function computeMergedPlace(target: Place, sources: Place[]): Place {
  const merged: Place = { ...target };

  for (const source of sources) {
    // Text fields: prefer non-empty values
    if (!merged.description?.trim() && source.description?.trim()) {
      merged.description = source.description;
    }
    if (!merged.address?.trim() && source.address?.trim()) {
      merged.address = source.address;
    }
    if (!merged.notes?.trim() && source.notes?.trim()) {
      merged.notes = source.notes;
    } else if (merged.notes?.trim() && source.notes?.trim() && merged.notes !== source.notes) {
      // Concatenate different notes
      merged.notes = `${merged.notes}\n\n---\n\n${source.notes}`;
    }
    if (!merged.price_level?.trim() && source.price_level?.trim()) {
      merged.price_level = source.price_level;
    }
    if (!merged.practicalInfo?.trim() && source.practicalInfo?.trim()) {
      merged.practicalInfo = source.practicalInfo;
    }
    if (!merged.best_time?.trim() && source.best_time?.trim()) {
      merged.best_time = source.best_time;
    }

    // Coordinates: prefer if target doesn't have
    if (!hasValidCoords(merged.coords) && hasValidCoords(source.coords)) {
      merged.coords = source.coords;
    }

    // Array fields: merge unique values
    merged.tags = mergeArrays(merged.tags, source.tags);
    merged.vibes = mergeArrays(merged.vibes, source.vibes);
    merged.activities = mergeArrays(merged.activities, source.activities);
    merged.amenities = mergeArrays(merged.amenities, source.amenities);
    merged.cuisine = mergeArrays(merged.cuisine, source.cuisine);
    merged.altNames = mergeArrays(merged.altNames, source.altNames);

    // Use higher confidence
    if ((source.confidence ?? 0) > (merged.confidence ?? 0)) {
      merged.confidence = source.confidence;
    }
  }

  return merged;
}

function hasValidCoords(coords: Place['coords']): boolean {
  return !!(coords && typeof coords === 'object' &&
            'lat' in coords && 'lon' in coords &&
            coords.lat !== null && coords.lon !== null);
}

function mergeArrays(arr1: string[] | null | undefined, arr2: string[] | null | undefined): string[] {
  const set = new Set<string>();

  if (Array.isArray(arr1)) {
    arr1.forEach(item => set.add(item.toLowerCase().trim()));
  }
  if (Array.isArray(arr2)) {
    arr2.forEach(item => set.add(item.toLowerCase().trim()));
  }

  return Array.from(set);
}

export function getCompletionFactorLabels(): Record<keyof DataCompletenessScore['factors'], string> {
  return {
    hasCoords: 'Coordinates',
    hasDescription: 'Description',
    hasAddress: 'Address',
    hasTags: 'Tags',
    hasVibes: 'Vibes',
    hasActivities: 'Activities',
    hasAmenities: 'Amenities',
    hasCuisine: 'Cuisine',
    hasAltNames: 'Alternative names',
    hasNotes: 'Notes',
    hasPrice: 'Price level',
    hasPracticalInfo: 'Practical info',
    isInLibrary: 'In library',
    hasHighConfidence: 'High confidence',
  };
}
