/**
 * Whether a place needs a look before it can skip Review.
 *
 * Same rule set Review names for `reviewChecks`: no pin (a missing pin and the
 * 0,0 Gulf of Guinea fallback both count), no city, confidence under 0.6
 * (the stand-in for a shaky name), or kind `tip`. A likely duplicate is
 * Review's own inline check and is not decided here.
 */

export interface ReviewCheckPlace {
  city: string | null;
  kind: string | null;
  confidence: number | null;
  coords: { lat: number; lon: number } | null;
}

export type ReviewCheckId = 'pin' | 'city' | 'name' | 'kind';

export function hasReviewPin(coords: { lat: number; lon: number } | null | undefined): boolean {
  if (!coords) return false;
  const { lat, lon } = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

export function reviewChecks(place: ReviewCheckPlace): ReviewCheckId[] {
  const checks: ReviewCheckId[] = [];
  if (!hasReviewPin(place.coords)) checks.push('pin');
  if (!place.city || place.city.trim() === '') checks.push('city');
  if (place.confidence == null || place.confidence < 0.6) checks.push('name');
  if (place.kind === 'tip') checks.push('kind');
  return checks;
}

export function looksRight(place: ReviewCheckPlace): boolean {
  return reviewChecks(place).length === 0;
}
