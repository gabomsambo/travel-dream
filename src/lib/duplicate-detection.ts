import type { Place } from '@/types/database';
import { citiesMatch, citiesMatchInCountry } from '@/lib/city-names';

// Configuration for duplicate detection
export interface DuplicateDetectionConfig {
  // Name similarity thresholds
  nameThreshold: number; // 0.0-1.0, higher = more strict

  // Location proximity thresholds in kilometers
  locationThresholdKm: number;

  // Minimum confidence score for considering a match
  minConfidenceScore: number;

  // Weight factors for scoring
  weights: {
    name: number;
    location: number;
    kind: number;
    city: number;
    country: number;
  };
}

export const DEFAULT_DETECTION_CONFIG: DuplicateDetectionConfig = {
  nameThreshold: 0.8,
  locationThresholdKm: 0.5, // 500 meters
  minConfidenceScore: 0.6,
  weights: {
    name: 0.4,    // 40% - most important
    location: 0.3, // 30% - very important for places
    kind: 0.15,   // 15% - type should match
    city: 0.1,    // 10% - location context
    country: 0.05 // 5% - broader context
  }
};

export interface DuplicateMatch {
  place: Place;
  confidence: number;
  factors: {
    nameScore: number;
    locationScore: number;
    kindMatch: boolean;
    cityMatch: boolean;
    countryMatch: boolean;
  };
  reasoning: string[];
}

export interface DuplicateDetectionResult {
  originalPlace: Place;
  potentialDuplicates: DuplicateMatch[];
  hasHighConfidenceDuplicates: boolean;
  totalCandidates: number;
}

/** Factor scores on a group edge. Kind, city, and country are 1 or 0. */
export interface DuplicateEdgeFactors {
  name: number;
  location: number;
  kind: number;
  city: number;
  country: number;
}

export type DuplicateEdgeFlag =
  | 'same Google place'
  | 'same spot, different name'
  | 'far apart';

/**
 * One pair inside a group. `included` is true when this edge is why the
 * members share a group (score at or above the grouping threshold).
 */
export interface DuplicateGroupEdge {
  a: string;
  b: string;
  score: number;
  included: boolean;
  distanceM: number | null;
  factors: DuplicateEdgeFactors;
  for: string[];
  against: string[];
  flags: DuplicateEdgeFlag[];
}

/** A place the distance split removed. Empty until that split ships. */
export interface DuplicateLeftOut {
  id: string;
  name: string;
  distanceM: number;
  fromId: string;
  reason: string;
}

export interface DuplicateCluster {
  /** Member ids sorted and joined with `+`. Stable across requests. */
  id: string;
  /** Same value as `id`. Kept so today's page can keep reading `cluster_id`. */
  cluster_id: string;
  places: Place[];
  avgConfidence: number;
  weakestIncludedScore: number;
  edges: DuplicateGroupEdge[];
  leftOut: DuplicateLeftOut[];
  /** ISO timestamp when a merge alt-name explains an included edge. Null until that lookup ships. */
  mergedOn: string | null;
}

/**
 * Calculate Levenshtein distance between two strings
 * Returns normalized similarity score (0.0-1.0, higher = more similar)
 */
export function calculateNameSimilarity(str1: string, str2: string): number {
  if (!str1 && !str2) return 1.0;
  if (!str1 || !str2) return 0;

  const normalizedStr1 = normalizeNameForComparison(str1);
  const normalizedStr2 = normalizeNameForComparison(str2);

  if (normalizedStr1 === normalizedStr2) return 1.0;

  // Calculate exact Levenshtein similarity
  const levenshteinSim = calculateLevenshteinSimilarity(normalizedStr1, normalizedStr2);

  // Calculate word-based similarity (handles partial matches)
  const wordSim = calculateWordSimilarity(normalizedStr1, normalizedStr2);

  // Calculate token-based similarity (handles reordered words)
  const tokenSim = calculateTokenSimilarity(normalizedStr1, normalizedStr2);

  // Return the highest similarity score
  return Math.max(levenshteinSim, wordSim, tokenSim);
}

function normalizeNameForComparison(str: string): string {
  return str
    .toLowerCase()
    .trim()
    // Remove common prefixes/suffixes
    .replace(/^(the|la|le|el|basilica de|basílica de|church of|cathedral of|temple of)\s+/i, '')
    .replace(/\s+(church|cathedral|basilica|basílica|temple|mosque)$/i, '')
    // Normalize accented characters
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Remove special characters except spaces and hyphens
    .replace(/[^\w\s-]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateLevenshteinSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0 && len2 === 0) return 1.0;
  if (len1 === 0 || len2 === 0) return 0.0;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Calculate Levenshtein distance
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLength = Math.max(len1, len2);

  return 1.0 - (distance / maxLength);
}

function calculateWordSimilarity(str1: string, str2: string): number {
  const words1 = str1.split(/\s+/).filter(w => w.length > 0);
  const words2 = str2.split(/\s+/).filter(w => w.length > 0);

  if (words1.length === 0 && words2.length === 0) return 1.0;
  if (words1.length === 0 || words2.length === 0) return 0.0;

  let matchCount = 0;
  const used: boolean[] = new Array(words2.length).fill(false);

  for (const word1 of words1) {
    for (let i = 0; i < words2.length; i++) {
      if (!used[i] && calculateLevenshteinSimilarity(word1, words2[i]) > 0.8) {
        matchCount++;
        used[i] = true;
        break;
      }
    }
  }

  return (2 * matchCount) / (words1.length + words2.length);
}

function calculateTokenSimilarity(str1: string, str2: string): number {
  const tokens1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
  const tokens2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));

  if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
  if (tokens1.size === 0 || tokens2.size === 0) return 0.0;

  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size; // Jaccard similarity
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateLocationDistance(
  coords1: { lat: number; lon: number },
  coords2: { lat: number; lon: number }
): number {
  const R = 6371; // Earth's radius in kilometers

  const dLat = toRadians(coords2.lat - coords1.lat);
  const dLon = toRadians(coords2.lon - coords1.lon);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coords1.lat)) * Math.cos(toRadians(coords2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate location proximity score (0.0-1.0, higher = closer)
 */
export function calculateLocationSimilarity(
  coords1: { lat: number; lon: number } | null,
  coords2: { lat: number; lon: number } | null,
  thresholdKm: number
): number {
  if (!coords1 || !coords2) return 0;

  const distance = calculateLocationDistance(coords1, coords2);

  // If within threshold, calculate proximity score
  if (distance <= thresholdKm) {
    // Perfect score at 0 distance, linear decay to 0 at threshold
    return Math.max(0, 1 - (distance / thresholdKm));
  }

  return 0;
}

/**
 * Calculate overall duplicate confidence score
 * Uses adaptive weighting when location data is missing to prevent unfair penalization
 */
export function calculateDuplicateScore(
  place1: Place,
  place2: Place,
  config: DuplicateDetectionConfig = DEFAULT_DETECTION_CONFIG
): { score: number; factors: DuplicateMatch['factors'] } {
  // Check if both places have valid coordinates
  const hasLocation = place1.coords && place2.coords &&
    typeof place1.coords.lat === 'number' && typeof place1.coords.lon === 'number' &&
    typeof place2.coords.lat === 'number' && typeof place2.coords.lon === 'number';

  const factors = {
    nameScore: calculateNameSimilarity(place1.name, place2.name),
    locationScore: hasLocation
      ? calculateLocationSimilarity(place1.coords, place2.coords, config.locationThresholdKm)
      : 0,
    kindMatch: place1.kind === place2.kind,
    // Treat null === null as a match for city/country (both unknown is compatible)
    cityMatch: place1.city?.toLowerCase() === place2.city?.toLowerCase(),
    countryMatch: place1.country?.toLowerCase() === place2.country?.toLowerCase()
  };

  // Adaptive weighting: redistribute location weight when coords are missing
  let effectiveWeights = config.weights;
  
  if (!hasLocation) {
    // Redistribute location weight proportionally to other factors
    const locationWeight = config.weights.location;
    const otherWeightsSum = config.weights.name + config.weights.kind + 
                           config.weights.city + config.weights.country;
    
    effectiveWeights = {
      name: config.weights.name + (locationWeight * config.weights.name / otherWeightsSum),
      location: 0,
      kind: config.weights.kind + (locationWeight * config.weights.kind / otherWeightsSum),
      city: config.weights.city + (locationWeight * config.weights.city / otherWeightsSum),
      country: config.weights.country + (locationWeight * config.weights.country / otherWeightsSum)
    };
  }

  // Calculate weighted score with effective weights
  const score =
    factors.nameScore * effectiveWeights.name +
    factors.locationScore * effectiveWeights.location +
    (factors.kindMatch ? 1 : 0) * effectiveWeights.kind +
    (factors.cityMatch ? 1 : 0) * effectiveWeights.city +
    (factors.countryMatch ? 1 : 0) * effectiveWeights.country;

  return { score, factors };
}

/**
 * Generate human-readable reasoning for duplicate detection
 */
export function generateDuplicateReasoning(
  place1: Place,
  place2: Place,
  factors: DuplicateMatch['factors'],
  score: number
): string[] {
  const reasoning: string[] = [];

  if (factors.nameScore > 0.85) {
    reasoning.push('Names are nearly identical');
  } else if (factors.nameScore > 0.7) {
    reasoning.push('Names are very similar');
  } else if (factors.nameScore > 0.5) {
    reasoning.push('Names have some similarity');
  }

  if (factors.locationScore > 0.8) {
    reasoning.push('Locations are very close');
  } else if (factors.locationScore > 0.5) {
    reasoning.push('Locations are nearby');
  } else if (factors.locationScore > 0) {
    reasoning.push('Locations are within proximity threshold');
  }

  if (factors.kindMatch) {
    reasoning.push(`Both are ${place1.kind} type`);
  }

  if (factors.cityMatch && place1.city) {
    reasoning.push(`Both located in ${place1.city}`);
  }

  if (factors.countryMatch && place1.country) {
    reasoning.push(`Both in ${place1.country}`);
  }

  // Add low similarity warning for very low scores
  if (score <= 0.3) {
    reasoning.push('Low similarity detected');
  } else if (reasoning.length === 0) {
    reasoning.push('Low similarity detected');
  }

  return reasoning;
}

/**
 * Check for alternative name matches
 */
export function checkAlternativeNames(place1: Place, place2: Place): number {
  const allNames1 = [place1.name, ...(place1.altNames || [])];
  const allNames2 = [place2.name, ...(place2.altNames || [])];

  let maxSimilarity = 0;

  for (const name1 of allNames1) {
    for (const name2 of allNames2) {
      const similarity = calculateNameSimilarity(name1, name2);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
  }

  return maxSimilarity;
}

/**
 * Score one pair the same way `detectDuplicates` does, including the alt-name
 * boost. Returned even when the score is under the detector floor, so a group
 * can keep the pairs it would otherwise throw away.
 */
export function scoreDuplicatePair(
  place1: Place,
  place2: Place,
  config: DuplicateDetectionConfig = DEFAULT_DETECTION_CONFIG
): { score: number; factors: DuplicateMatch['factors']; reasoning: string[] } {
  const { score, factors } = calculateDuplicateScore(place1, place2, config);
  const altNameScore = checkAlternativeNames(place1, place2);
  const enhancedNameScore = Math.max(factors.nameScore, altNameScore);
  const enhancedScore = score + (enhancedNameScore - factors.nameScore) * config.weights.name;
  const enhancedFactors = { ...factors, nameScore: enhancedNameScore };

  return {
    score: enhancedScore,
    factors: enhancedFactors,
    reasoning: generateDuplicateReasoning(place1, place2, enhancedFactors, enhancedScore),
  };
}

/**
 * Main function to detect duplicates for a given place
 */
export function detectDuplicates(
  targetPlace: Place,
  candidatePlaces: Place[],
  config: DuplicateDetectionConfig = DEFAULT_DETECTION_CONFIG
): DuplicateDetectionResult {
  const potentialDuplicates: DuplicateMatch[] = [];

  for (const candidate of candidatePlaces) {
    // Skip self-comparison
    if (candidate.id === targetPlace.id) continue;

    const scored = scoreDuplicatePair(targetPlace, candidate, config);

    // Only include if above minimum confidence
    if (scored.score >= config.minConfidenceScore) {
      potentialDuplicates.push({
        place: candidate,
        confidence: scored.score,
        factors: scored.factors,
        reasoning: scored.reasoning,
      });
    }
  }

  // Sort by confidence descending
  potentialDuplicates.sort((a, b) => b.confidence - a.confidence);

  return {
    originalPlace: targetPlace,
    potentialDuplicates,
    hasHighConfidenceDuplicates: potentialDuplicates.some(d => d.confidence > 0.8),
    totalCandidates: candidatePlaces.length
  };
}

/**
 * Batch duplicate detection for multiple places (UNOPTIMIZED VERSION)
 * Preserved for testing and comparison
 */
export async function batchDetectDuplicatesUnoptimized(
  places: Place[],
  config: DuplicateDetectionConfig = DEFAULT_DETECTION_CONFIG,
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, DuplicateDetectionResult>> {
  const results = new Map<string, DuplicateDetectionResult>();

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const result = detectDuplicates(place, places, config);
    results.set(place.id, result);

    if (onProgress) {
      onProgress(i + 1, places.length);
    }
  }

  return results;
}

export { optimizedBatchDetectDuplicates as batchDetectDuplicates } from './duplicate-optimization';

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

/** Metres between two pins, or null when either place has no coordinates. */
function distanceMetres(place1: Place, place2: Place): number | null {
  const c1 = place1.coords;
  const c2 = place2.coords;
  if (
    !c1 || !c2 ||
    typeof c1.lat !== 'number' || typeof c1.lon !== 'number' ||
    typeof c2.lat !== 'number' || typeof c2.lon !== 'number'
  ) {
    return null;
  }
  return calculateLocationDistance(c1, c2) * 1000;
}

function citiesDisagree(place1: Place, place2: Place): boolean {
  const cityA = place1.city?.trim();
  const cityB = place2.city?.trim();
  if (!cityA || !cityB) return false;

  const countryA = place1.country?.trim().toLowerCase() ?? '';
  const countryB = place2.country?.trim().toLowerCase() ?? '';
  if (countryA && countryB && countryA !== countryB) {
    return !citiesMatchInCountry(
      { city: cityA, country: countryA },
      { city: cityB, country: countryB }
    );
  }
  return !citiesMatch(cityA, cityB);
}

function formatDistanceApart(metres: number): string {
  if (metres > 2000) return `${(metres / 1000).toFixed(1)} km apart`;
  return `${Math.round(metres)} m apart`;
}

/**
 * Against-sentences and flags for one pair. These do not change the score:
 * a missing city or a missing pin is the absence of a for-sentence, not a disagreement.
 */
function pairDisagreement(
  placeA: Place,
  placeB: Place,
  nameScore: number,
  rawMetres: number | null
): { against: string[]; flags: DuplicateEdgeFlag[] } {
  const against: string[] = [];
  const flags: DuplicateEdgeFlag[] = [];

  if (placeA.googlePlaceId && placeA.googlePlaceId === placeB.googlePlaceId) {
    flags.push('same Google place');
  }

  const kindsAgree = Boolean(
    placeA.kind?.trim() && placeB.kind?.trim() && placeA.kind === placeB.kind
  );
  if (
    rawMetres !== null &&
    rawMetres <= 50 &&
    nameScore < 0.5 &&
    kindsAgree
  ) {
    flags.push('same spot, different name');
  }

  if (nameScore < 0.5) against.push('Names differ');

  if (rawMetres !== null && rawMetres > 500) {
    against.push(formatDistanceApart(rawMetres));
    if (rawMetres > 2000) flags.push('far apart');
  }

  if (citiesDisagree(placeA, placeB)) {
    const cityA = placeA.city?.trim();
    const cityB = placeB.city?.trim();
    if (cityA && cityB) against.push(`${cityA} vs ${cityB}`);
  }

  if (placeA.kind?.trim() && placeB.kind?.trim() && placeA.kind !== placeB.kind) {
    against.push(`${placeA.kind} vs ${placeB.kind}`);
  }

  const countryA = placeA.country?.trim();
  const countryB = placeB.country?.trim();
  if (countryA && countryB && countryA.toLowerCase() !== countryB.toLowerCase()) {
    against.push(`${countryA} vs ${countryB}`);
  }

  return { against, flags };
}

function buildGroupEdge(
  placeA: Place,
  placeB: Place,
  storedScore: number | undefined,
  minConfidence: number,
  config: DuplicateDetectionConfig
): DuplicateGroupEdge {
  const scored = scoreDuplicatePair(placeA, placeB, config);
  const rawMetres = distanceMetres(placeA, placeB);
  const { against, flags } = pairDisagreement(placeA, placeB, scored.factors.nameScore, rawMetres);
  const qualified = storedScore !== undefined && storedScore >= minConfidence;

  return {
    a: placeA.id,
    b: placeB.id,
    // The detector's score is what put the edge in the group. Pairs the
    // detector dropped (under its floor) are rescored so the group can show them.
    score: qualified && storedScore !== undefined ? storedScore : scored.score,
    included: qualified,
    distanceM: rawMetres === null ? null : Math.round(rawMetres),
    factors: {
      name: scored.factors.nameScore,
      location: scored.factors.locationScore,
      kind: scored.factors.kindMatch ? 1 : 0,
      city: scored.factors.cityMatch ? 1 : 0,
      country: scored.factors.countryMatch ? 1 : 0,
    },
    for: scored.reasoning,
    against,
    flags,
  };
}

/**
 * Groups are connected components of main edges (score >= `minConfidence`).
 * The id is the member ids sorted and joined with `+`, so it does not depend
 * on database row order. Every pair inside the component is kept, including
 * pairs under the threshold.
 *
 * `leftOut` and `mergedOn` are present for the clusters contract. The distance
 * split and the merge-log date are not applied here.
 */
export function findDuplicateClusters(
  duplicateResults: Map<string, DuplicateDetectionResult>,
  minClusterSize: number = 2,
  minConfidence: number = 0.6,
  config: DuplicateDetectionConfig = DEFAULT_DETECTION_CONFIG
): DuplicateCluster[] {
  const placesById = new Map<string, Place>();
  const storedScore = new Map<string, number>();

  for (const [, result] of duplicateResults) {
    placesById.set(result.originalPlace.id, result.originalPlace);
  }
  for (const [placeId, result] of duplicateResults) {
    for (const duplicate of result.potentialDuplicates) {
      if (!placesById.has(duplicate.place.id)) {
        placesById.set(duplicate.place.id, duplicate.place);
      }
      const key = pairKey(placeId, duplicate.place.id);
      const previous = storedScore.get(key);
      if (previous === undefined || duplicate.confidence > previous) {
        storedScore.set(key, duplicate.confidence);
      }
    }
  }

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while ((parent.get(root) ?? root) !== root) {
      root = parent.get(root)!;
    }
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) ?? cursor;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) return;
    if (ra > rb) [ra, rb] = [rb, ra];
    parent.set(rb, ra);
  };

  for (const [key, score] of storedScore) {
    if (score < minConfidence) continue;
    const [a, b] = key.split('\0');
    union(a, b);
  }

  const components = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const members = components.get(root);
    if (members) members.push(id);
    else components.set(root, [id]);
  }

  const clusters: DuplicateCluster[] = [];
  for (const memberIds of components.values()) {
    if (memberIds.length < minClusterSize) continue;
    memberIds.sort();

    const places: Place[] = [];
    for (const memberId of memberIds) {
      const place = placesById.get(memberId);
      if (place) places.push(place);
    }
    if (places.length !== memberIds.length) continue;

    const edges: DuplicateGroupEdge[] = [];
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const placeA = places[i];
        const placeB = places[j];
        edges.push(buildGroupEdge(
          placeA,
          placeB,
          storedScore.get(pairKey(placeA.id, placeB.id)),
          minConfidence,
          config
        ));
      }
    }

    const included = edges.filter(edge => edge.included);
    if (included.length === 0) continue;

    const avgConfidence = included.reduce((sum, edge) => sum + edge.score, 0) / included.length;
    const weakestIncludedScore = Math.min(...included.map(edge => edge.score));
    const id = memberIds.join('+');

    clusters.push({
      id,
      cluster_id: id,
      places,
      avgConfidence,
      weakestIncludedScore,
      edges,
      leftOut: [],
      mergedOn: null,
    });
  }

  return clusters.sort((a, b) => b.avgConfidence - a.avgConfidence || a.id.localeCompare(b.id));
}