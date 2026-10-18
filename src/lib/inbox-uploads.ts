/**
 * Builds the Inbox uploads summary (`GET /api/inbox/uploads`): every mass
 * upload the user made, grouped by batch, with what happened to each
 * screenshot and each place.
 *
 * Every query goes through `forUser()`. Ids read out of JSON (`outcome`,
 * `upload_sessions.meta.duplicates`) are treated as untrusted input to a
 * scoped query, never as proof of ownership.
 */
import 'server-only';
import { and, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { attachments, places, sources, sourcesToPlaces, uploadSessions } from '@/db/schema';
import { forUser } from '@/lib/tenant-db';
import { toUserFriendlyError } from '@/lib/mass-upload/friendly-error';
import type {
  InboxPlaceStatus,
  InboxScreenshotOutcome,
  InboxUploadBatch,
  InboxUploadPlace,
  InboxUploadPlaceRow,
  InboxUploadScreenshot,
  InboxUploadSkipped,
} from '@/types/inbox-uploads';

// SQLite's bound-parameter limit is generous on libSQL, but stay well under it.
const CHUNK = 500;

type SourceMeta = (typeof sources.$inferSelect)['meta'];

/** `CURRENT_TIMESTAMP` writes `YYYY-MM-DD HH:MM:SS` (UTC); the app writes ISO. */
function toIso(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
}

async function chunked<T>(all: string[], query: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const unique = Array.from(new Set(all));
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) out.push(...(await query(unique.slice(i, i + CHUNK))));
  return out;
}

function screenshotOutcome(status: string, placeCount: number): InboxScreenshotOutcome {
  if (status === 'completed') return placeCount > 0 ? 'places' : 'noPlaceFound';
  if (status === 'failed' || status === 'stalled') return 'couldNotRead';
  if (status === 'cancelled') return 'cancelled';
  // uploaded / queued / extracting / enriching, or anything unrecognised: no verdict yet.
  return 'stillReading';
}

function addTo(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

function placeRow(list: InboxUploadPlace[]): InboxUploadPlaceRow {
  return {
    placeIds: list.map((p) => p.id),
    sourceIds: Array.from(new Set(list.flatMap((p) => p.sourceIds))),
    places: list,
  };
}

export async function getInboxUploads(userId: string): Promise<InboxUploadBatch[]> {
  const tdb = forUser(userId);
  const sessionIdOf = sql<string | null>`json_extract(${sources.meta}, '$.uploadInfo.sessionId')`;

  // Mass-upload screenshots only. `pending` (and NULL) is the older uploader's
  // resting state, including production's deliberate legacy rows.
  const sourceRows = await tdb.selectFields(
    sources,
    {
      id: sources.id,
      uri: sources.uri,
      meta: sources.meta,
      createdAt: sources.createdAt,
      processingStatus: sources.processingStatus,
      processingError: sources.processingError,
      sessionId: sessionIdOf,
    },
    and(eq(sources.type, 'screenshot'), ne(sources.processingStatus, 'pending'), sql`${sessionIdOf} IS NOT NULL`) as SQL
  ).orderBy(sources.createdAt, sources.id);

  const sessionRows = await tdb.selectFields(uploadSessions, {
    id: uploadSessions.id,
    startedAt: uploadSessions.startedAt,
    meta: uploadSessions.meta,
  });
  const sessionsById = new Map(sessionRows.map((s) => [s.id, s]));

  // ---- per-screenshot places: the recorded outcome, else derived from joins.
  const sourceIds = sourceRows.map((s) => s.id);
  const links = await chunked(sourceIds, (part) =>
    tdb.selectFieldsVia(
      sourcesToPlaces,
      { sourceId: sourcesToPlaces.sourceId, placeId: sourcesToPlaces.placeId },
      inArray(sourcesToPlaces.sourceId, part)
    )
  );
  const linksBySource = new Map<string, string[]>();
  for (const link of links) addTo(linksBySource, link.sourceId, link.placeId);

  const recorded = (meta: SourceMeta) => {
    const outcome = meta?.massUpload?.outcome as { created?: unknown; linked?: unknown } | undefined;
    if (!outcome || !Array.isArray(outcome.created) || !Array.isArray(outcome.linked)) return null;
    const linked = (outcome.linked as Array<{ placeId?: unknown } | null>).map((l) => l?.placeId);
    return { created: ids(outcome.created), linked: ids(linked) };
  };

  // Legacy rows: a place that carries this screenshot as a photo was created
  // from it (createPlacesFromPipeline attaches the screenshot only to places it
  // inserts); a joined place without it was an existing place it was linked to.
  const legacyPlaceIds = sourceRows.filter((s) => !recorded(s.meta)).flatMap((s) => linksBySource.get(s.id) ?? []);
  const photoRows = await chunked(legacyPlaceIds, (part) =>
    tdb.selectFieldsVia(attachments, { placeId: attachments.placeId, uri: attachments.uri }, inArray(attachments.placeId, part))
  );
  const photoKeys = new Set(photoRows.map((a) => `${a.placeId}\n${a.uri}`));

  const screenshots = sourceRows.map((s) => {
    const status = s.processingStatus ?? 'pending';
    const outcome = recorded(s.meta);
    const joined = linksBySource.get(s.id) ?? [];
    const createdPlaceIds = outcome ? outcome.created : joined.filter((p) => photoKeys.has(`${p}\n${s.uri}`));
    const linkedPlaceIds = outcome
      ? outcome.linked.filter((p) => !outcome.created.includes(p))
      : joined.filter((p) => !photoKeys.has(`${p}\n${s.uri}`));
    const view: InboxUploadScreenshot = {
      sourceId: s.id,
      name: s.meta?.uploadInfo?.originalName ?? s.meta?.filename ?? null,
      imageUrl: s.meta?.massUpload?.thumbnailUrl ?? s.meta?.uploadInfo?.thumbnailPath ?? s.uri ?? null,
      processingStatus: status,
      outcome: screenshotOutcome(status, createdPlaceIds.length + linkedPlaceIds.length),
      createdPlaceIds,
      linkedPlaceIds,
      outcomeDerived: !outcome && (status === 'completed' || joined.length > 0),
    };
    return { view, sessionId: String(s.sessionId), createdAt: toIso(s.createdAt), error: s.processingError };
  });

  // ---- the places themselves, re-scoped: outcome ids are only JSON.
  const placeIds = screenshots.flatMap((s) => [...s.view.createdPlaceIds, ...s.view.linkedPlaceIds]);
  const placeRows = await chunked(placeIds, (part) =>
    tdb.selectFields(
      places,
      { id: places.id, name: places.name, city: places.city, country: places.country, status: places.status },
      inArray(places.id, part)
    )
  );
  const placesById = new Map(placeRows.map((p) => [p.id, p]));
  // Only echo ids that resolved to the caller's own live places. `outcome`
  // keeps the screenshot's verdict ("places" stays "places" after a merge).
  for (const { view } of screenshots) {
    view.createdPlaceIds = view.createdPlaceIds.filter((id) => placesById.has(id));
    view.linkedPlaceIds = view.linkedPlaceIds.filter((id) => placesById.has(id));
  }

  // ---- skipped re-uploads, and the earlier screenshot each one matched.
  const skippedBySession = new Map<string, Array<{ originalName: string; duplicateOf: string | null }>>();
  for (const session of sessionRows) {
    const list = (Array.isArray(session.meta?.duplicates) ? session.meta.duplicates : [])
      .filter((d) => d && typeof d.originalName === 'string')
      .map((d) => ({ originalName: d.originalName, duplicateOf: typeof d.duplicateOf === 'string' ? d.duplicateOf : null }));
    if (list.length > 0) skippedBySession.set(session.id, list);
  }
  const originalIds = Array.from(skippedBySession.values()).flat().map((d) => d.duplicateOf).filter((id): id is string => !!id);
  const originals = await chunked(originalIds, (part) =>
    tdb.selectFields(sources, { id: sources.id, createdAt: sources.createdAt, sessionId: sessionIdOf }, inArray(sources.id, part))
  );
  const originalsById = new Map(originals.map((o) => [o.id, o]));

  // ---- group into batches. A session with neither screenshots nor skips
  // (the old uploader's leftovers) is not a batch.
  const batchIds = new Set([...screenshots.map((s) => s.sessionId), ...skippedBySession.keys()]);
  const batches: InboxUploadBatch[] = [];

  for (const sessionId of batchIds) {
    const own = screenshots.filter((s) => s.sessionId === sessionId);
    const created = new Map<string, string[]>();
    const linked = new Map<string, string[]>();
    for (const s of own) {
      for (const p of s.view.createdPlaceIds) addTo(created, p, s.view.sourceId);
      for (const p of s.view.linkedPlaceIds) addTo(linked, p, s.view.sourceId);
    }
    // A place this batch created and another of its screenshots then matched
    // is still a new place, seen in both screenshots.
    for (const [p, from] of linked) {
      if (!created.has(p)) continue;
      for (const sourceId of from) addTo(created, p, sourceId);
      linked.delete(p);
    }

    const toPlaces = (map: Map<string, string[]>): InboxUploadPlace[] =>
      Array.from(map).flatMap(([id, sourceIds]) => {
        const row = placesById.get(id);
        if (!row) return [];
        return [{ id, name: row.name, city: row.city, country: row.country, status: row.status as InboxPlaceStatus, sourceIds }];
      });
    const createdPlaces = toPlaces(created);
    const linkedPlaces = toPlaces(linked);
    const byStatus = (status: InboxPlaceStatus) => placeRow(createdPlaces.filter((p) => p.status === status));
    const sourcesWith = (outcome: InboxScreenshotOutcome) =>
      own.filter((s) => s.view.outcome === outcome).map((s) => s.view.sourceId);

    const skipped: InboxUploadSkipped[] = (skippedBySession.get(sessionId) ?? []).map((d) => {
      const original = d.duplicateOf ? originalsById.get(d.duplicateOf) : undefined;
      const originalSession = original?.sessionId ? sessionsById.get(original.sessionId) : undefined;
      return {
        originalName: d.originalName,
        duplicateOfSourceId: original ? original.id : null,
        duplicateOfSessionId: original?.sessionId ?? null,
        duplicateOfUploadedAt: original ? toIso(originalSession?.startedAt ?? original.createdAt) : null,
      };
    });

    const session = sessionsById.get(sessionId);
    const earliest = own.map((s) => s.createdAt).sort()[0];
    batches.push({
      sessionId,
      uploadedAt: toIso(session?.startedAt ?? earliest ?? new Date(0).toISOString()),
      screenshotCount: own.length + skipped.length,
      placesRead: createdPlaces.length + linkedPlaces.length,
      newPlaces: createdPlaces.length,
      rows: {
        toReview: { ...byStatus('inbox'), checkCount: null },
        added: byStatus('library'),
        notAPlace: byStatus('archived'),
        alreadyInLibrary: placeRow(linkedPlaces),
        uploadedBefore: { items: skipped },
        noPlaceFound: { sourceIds: sourcesWith('noPlaceFound') },
        couldNotRead: {
          sourceIds: sourcesWith('couldNotRead'),
          items: own
            .filter((s) => s.view.outcome === 'couldNotRead')
            .map((s) => ({
              sourceId: s.view.sourceId,
              status: s.view.processingStatus as 'failed' | 'stalled',
              error: toUserFriendlyError(s.error ?? ''),
            })),
        },
        stillReading: { sourceIds: sourcesWith('stillReading') },
        cancelled: { sourceIds: sourcesWith('cancelled') },
      },
      screenshots: own.map((s) => s.view),
      outcomeDerived: own.some((s) => s.view.outcomeDerived),
    });
  }

  return batches.sort(
    (a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt) || (a.sessionId < b.sessionId ? 1 : -1)
  );
}
