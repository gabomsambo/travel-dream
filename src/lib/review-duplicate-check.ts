import { and, eq } from 'drizzle-orm';
import { attachments, dismissedDuplicates, places } from '@/db/schema';
import {
  DEFAULT_DETECTION_CONFIG,
  detectDuplicates,
  findDuplicateClusters,
  type DuplicateCluster,
  type DuplicateDetectionResult,
  type DuplicateMatch,
} from '@/lib/duplicate-detection';
import {
  CERTAINTY_LABEL,
  DUPLICATE_PAGE_BAND,
  certaintyWord,
  formatMergedOn,
  type CertaintyWord,
} from '@/lib/duplicate-certainty';
import { forUser } from '@/lib/tenant-db';
import type { Place } from '@/types/database';

export interface ReviewDuplicateMatch {
  placeId: string;
  name: string;
  city: string | null;
  kind: string;
  createdAt: string;
  photoUrl: string | null;
  confidence: number;
  certainty: CertaintyWord;
  label: string;
  /** Short evidence line: name, city, distance, when it was saved. */
  summary: string;
}

export type ReviewDuplicateCheck =
  | { status: 'missing' }
  | { status: 'ok'; match: ReviewDuplicateMatch | null };

function pairDismissed(dismissed: Set<string>, a: string, b: string): boolean {
  return dismissed.has(`${a}:${b}`) || dismissed.has(`${b}:${a}`);
}

function displayablePhoto(uri: string | null | undefined): string | null {
  if (!uri) return null
  if (uri.startsWith('data:image/')) return uri
  if (uri.startsWith('/') && !uri.startsWith('//')) return uri
  try {
    const url = new URL(uri)
    if (url.protocol === 'https:' || url.protocol === 'http:') return uri
  } catch {
    return null
  }
  return null
}

function sharesNameStart(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left.length < 4 || right.length < 4 || left === right) return false;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return longer.startsWith(shorter);
}

function pinsApart(metres: number): string {
  if (metres >= 1000) {
    const km = metres / 1000;
    const rounded = km >= 10 ? Math.round(km).toString() : (Math.round(km * 10) / 10).toString();
    return `pins ${rounded} km apart`;
  }
  return `pins ${Math.round(metres)} m apart`;
}

/** The one-line evidence under "Looks like …, already in your Library". */
export function duplicateNoteSummary(cluster: DuplicateCluster, libraryPlace: Place): string {
  const edge = cluster.edges[0];
  const phrases: string[] = [];
  if (edge) {
    const other = cluster.places.find((place) => place.id !== libraryPlace.id);
    const libraryName = libraryPlace.name;
    const otherName = other?.name ?? '';
    if (sharesNameStart(libraryName, otherName)) phrases.push('Same name start');
    else if (edge.factors.name >= 0.95) phrases.push('Same name');
    else if (edge.factors.name >= 0.7) phrases.push('Similar names');
    if (edge.factors.city === 1 && libraryPlace.city?.trim()) {
      phrases.push(`both ${libraryPlace.city.trim()}`);
    }
    if (edge.distanceM !== null) phrases.push(pinsApart(edge.distanceM));
  }
  if (libraryPlace.createdAt) phrases.push(`saved ${formatMergedOn(libraryPlace.createdAt)}`);
  return phrases.join(' · ');
}

function twoPlaceCluster(target: Place, match: DuplicateMatch): DuplicateCluster | null {
  const forward: DuplicateDetectionResult = {
    originalPlace: target,
    potentialDuplicates: [match],
    hasHighConfidenceDuplicates: match.confidence > 0.8,
    totalCandidates: 1,
  };
  const back: DuplicateDetectionResult = {
    originalPlace: match.place,
    potentialDuplicates: [{
      place: target,
      confidence: match.confidence,
      factors: match.factors,
      reasoning: match.reasoning,
      flags: match.flags,
    }],
    hasHighConfidenceDuplicates: match.confidence > 0.8,
    totalCandidates: 1,
  };
  const results = new Map<string, DuplicateDetectionResult>([
    [target.id, forward],
    [match.place.id, back],
  ]);
  return findDuplicateClusters(
    results,
    2,
    DUPLICATE_PAGE_BAND.possibleMin,
  ).find((cluster) => cluster.places.length === 2) ?? null;
}

/**
 * Best Library match for one place. Inbox and archived rows are not candidates.
 * Dismissed pairs are dropped. The certainty word comes from a 2-place cluster,
 * the same function the duplicates queue uses. A pair that does not form that
 * cluster, and a "Probably not" pair, is skipped for the next candidate that
 * yields a note.
 */
export async function checkLibraryDuplicate(userId: string, placeId: string): Promise<ReviewDuplicateCheck> {
  const scope = forUser(userId);
  const owned = await scope.findOwned(places, placeId);
  if (owned.status !== 'ok') return { status: 'missing' };

  const library = await scope.select(places, eq(places.status, 'library'));
  const candidates = library.filter((place) => place.id !== placeId);
  if (candidates.length === 0) return { status: 'ok', match: null };

  const dismissedRows = await scope.select(dismissedDuplicates);
  const dismissed = new Set(dismissedRows.map((row) => `${row.placeId1}:${row.placeId2}`));

  const detected = detectDuplicates(owned.row, candidates, {
    ...DEFAULT_DETECTION_CONFIG,
    minConfidenceScore: DUPLICATE_PAGE_BAND.possibleMin,
  });
  let chosen: {
    candidate: DuplicateMatch;
    cluster: DuplicateCluster;
    certainty: CertaintyWord;
  } | null = null;
  for (const candidate of detected.potentialDuplicates) {
    if (pairDismissed(dismissed, placeId, candidate.place.id)) continue;
    const cluster = twoPlaceCluster(owned.row, candidate);
    if (!cluster) continue;
    const certainty = certaintyWord(cluster);
    if (certainty === 'probably-not') continue;
    chosen = { candidate, cluster, certainty };
    break;
  }
  if (!chosen) return { status: 'ok', match: null };

  const photos = await scope.selectVia(
    attachments,
    and(eq(attachments.placeId, chosen.candidate.place.id), eq(attachments.type, 'photo')),
  );
  const cover = [...photos].sort((a, b) => b.isPrimary - a.isPrimary || a.createdAt.localeCompare(b.createdAt))[0];

  return {
    status: 'ok',
    match: {
      placeId: chosen.candidate.place.id,
      name: chosen.candidate.place.name,
      city: chosen.candidate.place.city,
      kind: chosen.candidate.place.kind,
      createdAt: chosen.candidate.place.createdAt,
      photoUrl: displayablePhoto(cover?.uri) ?? displayablePhoto(cover?.thumbnailUri),
      confidence: chosen.candidate.confidence,
      certainty: chosen.certainty,
      label: CERTAINTY_LABEL[chosen.certainty],
      summary: duplicateNoteSummary(chosen.cluster, chosen.candidate.place),
    },
  };
}
