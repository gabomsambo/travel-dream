/**
 * The version of one user's Library index: a short string that changes whenever
 * the places, photos or collections the index carries change, and not otherwise.
 * It is the cache key of `/api/library/index?v=…`, so a stale one would show a
 * stale library from the browser's cache — it has to move on every edit.
 *
 * It is a digest of aggregates, not a counter, so no mutation has to remember to
 * bump it. Each table contributes what its edits change:
 *
 * - `places` in the library: row count and newest `updated_at` (every place write
 *   sets it). Archiving or confirming a place changes the count.
 * - `attachments` of those places: count, newest `created_at`, `sum(rowid)` (a
 *   delete plus an add still moves it), `sum(is_primary * rowid)` (making another
 *   photo primary writes no place row) and the thumbnail lengths (a thumbnail
 *   landing later).
 * - `collections` and their links: count, newest `updated_at`, `sum(rowid)`.
 *
 * Hearts, saved views, the inbox and the Archive are deliberately absent: hearts,
 * views and the inbox count ride in the page, and the rest is not in the index, so
 * a heart or a screenshot landing in the Inbox does not throw the cached index away.
 *
 * The user id is hashed in, which keeps every user's URL their own, and so does
 * `WIRE_FORMAT`, so a new encoding never meets an old cache entry.
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { attachments, collections, places, placesToCollections } from '@/db/schema';
import { forUser } from '@/lib/tenant-db';
import { WIRE_FORMAT } from './wire';

const num = (v: unknown) => Number(v ?? 0);

export async function libraryVersion(userId: string): Promise<string> {
  const scoped = forUser(userId);
  const [[p], [a], [c], [l]] = await Promise.all([
    scoped.selectFields(
      places,
      { n: sql`count(*)`, at: sql`max(${places.updatedAt})` },
      eq(places.status, 'library')
    ),
    scoped.selectFieldsVia(
      attachments,
      {
        n: sql`count(*)`,
        at: sql`max(${attachments.createdAt})`,
        rows: sql`coalesce(sum(rowid), 0)`,
        primary: sql`coalesce(sum(${attachments.isPrimary} * rowid), 0)`,
        thumbs: sql`coalesce(sum(length(coalesce(${attachments.thumbnailUri}, ''))), 0)`,
      },
      // Narrowing only: the scope already limits these to the caller's places, and this keeps the
      // photos of Inbox places (a mass upload is attaching them) from moving the library's version.
      and(eq(attachments.type, 'photo'), sql`${attachments.placeId} in (select id from places where status = 'library')`)
    ),
    scoped.selectFields(collections, { n: sql`count(*)`, at: sql`max(${collections.updatedAt})` }),
    scoped.selectFieldsVia(placesToCollections, { n: sql`count(*)`, rows: sql`coalesce(sum(rowid), 0)` }),
  ]);

  const parts = [
    WIRE_FORMAT,
    userId,
    num(p?.n), p?.at ?? '',
    num(a?.n), a?.at ?? '', num(a?.rows), num(a?.primary), num(a?.thumbs),
    num(c?.n), c?.at ?? '',
    num(l?.n), num(l?.rows),
  ];
  return createHash('sha256').update(parts.join('\u0000')).digest('base64url').slice(0, 22);
}
