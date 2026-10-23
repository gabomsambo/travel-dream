export interface ReviewRankSource {
  id: string;
  type: string;
  createdAt: string;
  sessionId?: string | null;
}

export interface ReviewRankKey {
  sourceCreatedAt: string;
  sourceId: string;
  createdAt: string;
  placeId: string;
}

/** Newest screenshot on the place, or the newest source when it has none. */
export function rankingSource<T extends ReviewRankSource>(
  sources: T[],
  uploadSessionId?: string,
): T | null {
  const pool = uploadSessionId
    ? sources.filter((source) => source.sessionId === uploadSessionId)
    : sources;
  const ordered = [...pool].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
  return ordered.find((source) => source.type === 'screenshot') ?? ordered[0] ?? null;
}

export function compareReviewRank(a: ReviewRankKey, b: ReviewRankKey): number {
  const bySourceTime = b.sourceCreatedAt.localeCompare(a.sourceCreatedAt);
  if (bySourceTime !== 0) return bySourceTime;
  const bySource = a.sourceId.localeCompare(b.sourceId);
  if (bySource !== 0) return bySource;
  const byPlaceTime = a.createdAt.localeCompare(b.createdAt);
  return byPlaceTime || a.placeId.localeCompare(b.placeId);
}
