import type { Place } from '@/types/database';

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

    // Calculate base duplicate score
    const { score, factors } = calculateDuplicateScore(targetPlace, candidate, config);

    // Check alternative names for better matching
    const altNameScore = checkAlternativeNames(targetPlace, candidate);
    const enhancedNameScore = Math.max(factors.nameScore, altNameScore);

    // Recalculate with enhanced name score
    const enhancedScore = score + (enhancedNameScore - factors.nameScore) * config.weights.name;

    // Only include if above minimum confidence
    if (enhancedScore >= config.minConfidenceScore) {
      const enhancedFactors = { ...factors, nameScore: enhancedNameScore };

      potentialDuplicates.push({
        place: candidate,
        confidence: enhancedScore,
        factors: enhancedFactors,
        reasoning: generateDuplicateReasoning(
          targetPlace,
          candidate,
          enhancedFactors,
          enhancedScore
        )
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

/**
 * Find all duplicate clusters (groups of similar places)
 * @param duplicateResults - Map of place IDs to their duplicate detection results
 * @param minClusterSize - Minimum number of places to form a cluster (default: 2)
 * @param minConfidence - Minimum confidence threshold for including duplicates in clusters (default: 0.6)
 */
export function findDuplicateClusters(
  duplicateResults: Map<string, DuplicateDetectionResult>,
  minClusterSize: number = 2,
  minConfidence: number = 0.6
): Array<{ places: Place[]; avgConfidence: number; cluster_id: string }> {
  const processed = new Set<string>();
  const clusters: Array<{ places: Place[]; avgConfidence: number; cluster_id: string }> = [];

  for (const [placeId, result] of duplicateResults) {
    if (processed.has(placeId)) continue;

    const cluster: Place[] = [result.originalPlace];
    let totalConfidence = 0;
    let confidenceCount = 0;

    // Add duplicates that meet the configurable confidence threshold
    for (const duplicate of result.potentialDuplicates) {
      if (duplicate.confidence >= minConfidence && !processed.has(duplicate.place.id)) {
        cluster.push(duplicate.place);
        totalConfidence += duplicate.confidence;
        confidenceCount++;
      }
    }

    // Mark all places in cluster as processed
    cluster.forEach(place => processed.add(place.id));

    // Only include clusters with multiple places
    if (cluster.length >= minClusterSize) {
      clusters.push({
        places: cluster,
        avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
        cluster_id: `cluster_${crypto.randomUUID()}`
      });
    }
  }

  return clusters.sort((a, b) => b.avgConfidence - a.avgConfidence);
}