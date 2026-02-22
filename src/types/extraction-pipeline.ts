import { PlaceKind } from './database';

// Mirrors Gemini JSON response shape for a single extracted place
export interface GeminiExtractedPlace {
  name: string;
  kind: PlaceKind;
  city: string | null;
  country: string | null;
  admin: string | null;
  description: string | null;
  tags: string[] | null;
  vibes: string[] | null;
  confidence: number;
  price_level: string | null;
  best_time: string | null;
  activities: string[] | null;
  cuisine: string[] | null;
  amenities: string[] | null;
  practicalInfo: string | null;
  recommendedBy: string | null;
}

// GeminiExtractedPlace + Google Places enrichment fields (used by Phase 2)
export interface PipelinePlace extends GeminiExtractedPlace {
  coords: { lat: number; lon: number } | null;
  address: string | null;
  googlePlaceId: string | null;
}

// Metadata about the source image
export interface ImageContext {
  platform: string;
  contentType: string;
  language: string;
  hasMap: boolean;
  hasPhoto: boolean;
  textDensity: 'low' | 'medium' | 'high';
}

// Full result from one Gemini extraction call
export interface GeminiExtractionResult {
  places: GeminiExtractedPlace[];
  imageContext: ImageContext | null;
  rawResponse: string;
  extractionTimeMs: number;
}
