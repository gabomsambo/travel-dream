import { usablePin } from '@/lib/place-coords'

/**
 * Below this, Review asks the user to look at the name. Gemini stores one
 * confidence for the whole place; this is that number, not a per-field score.
 */
export const REVIEW_NAME_CONFIDENCE = 0.6

export type ReviewCheckId = 'pin' | 'city' | 'confidence' | 'tip'

/** The fields the four rules read. Anything else on the row is ignored. */
export interface ReviewCheckPlace {
  coords: { lat: number; lon: number } | null
  city: string | null
  confidence: number | null
  kind: string
}

/**
 * What Review should mark "Check this" on one place.
 *
 * Order is stable: pin, city, confidence, tip. A missing pin includes a stored
 * `{lat: 0, lon: 0}`. A blank city counts as no city. Confidence flags only a
 * real number under {@link REVIEW_NAME_CONFIDENCE}. `tip` is travel advice,
 * not a place, whatever the confidence is.
 */
export function reviewChecks(place: ReviewCheckPlace): ReviewCheckId[] {
  const checks: ReviewCheckId[] = []
  if (!usablePin(place.coords)) checks.push('pin')
  if (!place.city || place.city.trim() === '') checks.push('city')
  if (typeof place.confidence === 'number' && Number.isFinite(place.confidence) && place.confidence < REVIEW_NAME_CONFIDENCE) {
    checks.push('confidence')
  }
  if (place.kind === 'tip') checks.push('tip')
  return checks
}
