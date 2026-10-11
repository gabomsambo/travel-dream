/**
 * The Library's own rows — hearts and saved views — read and written through
 * `forUser()`, so every query here is pinned to the caller before it is built.
 *
 * A heart names a place, and the table cannot say that place must be the same
 * user's: owning the heart row is not owning the place it names. So every
 * write takes the caller's place ids from `places` first and only ever hearts
 * those (AGENTS.md § Multi-Tenancy).
 */
import 'server-only';
import { asc, eq, inArray } from 'drizzle-orm';
import { placeHearts, places, savedViews } from '@/db/schema';
import { forUser } from '@/lib/tenant-db';
import type { SavedViewRow } from './types';

/** Writes take ids in chunks of this size, well under SQLite's bound-parameter limit. */
const CHUNK = 400;

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

export async function getHeartIds(userId: string): Promise<string[]> {
  const rows = await forUser(userId).selectFields(placeHearts, { placeId: placeHearts.placeId });
  return rows.map((r) => r.placeId);
}

/**
 * Hearts (`on`) or un-hearts the given places. Ids that are not the caller's
 * places are ignored, not errors: a device's old hearts can name places that
 * were deleted since. Idempotent both ways. Returns the caller's places among
 * `placeIds`, i.e. the ids whose heart now reads `on`.
 */
export async function setHearts(userId: string, placeIds: string[], on: boolean): Promise<string[]> {
  const ids = [...new Set(placeIds)];
  if (!ids.length) return [];
  return forUser(userId).transaction(async (tdb) => {
    const owned: string[] = [];
    for (const part of chunks(ids)) {
      const rows = await tdb.selectFields(places, { id: places.id }, inArray(places.id, part));
      owned.push(...rows.map((r) => r.id));
    }
    if (!owned.length) return [];
    for (const part of chunks(owned)) {
      if (on) {
        await tdb.insertMany(placeHearts, part.map((placeId) => ({ placeId }))).onConflictDoNothing();
      } else {
        await tdb.deleteFrom(placeHearts, inArray(placeHearts.placeId, part));
      }
    }
    return owned;
  });
}

function toRow(r: typeof savedViews.$inferSelect): SavedViewRow {
  return { id: r.id, name: r.name, query: r.query };
}

export async function listSavedViews(userId: string): Promise<SavedViewRow[]> {
  const rows = await forUser(userId).select(savedViews).orderBy(asc(savedViews.createdAt), asc(savedViews.id));
  return rows.map(toRow);
}

export async function countSavedViews(userId: string): Promise<number> {
  return (await forUser(userId).selectFields(savedViews, { id: savedViews.id })).length;
}

export async function createSavedView(userId: string, name: string, query: string): Promise<SavedViewRow> {
  const [row] = await forUser(userId).insert(savedViews, { name, query }).returning();
  return toRow(row);
}

/** Null when there is no such view of the caller's (someone else's included). */
export async function updateSavedView(
  userId: string,
  id: string,
  patch: { name?: string; query?: string }
): Promise<SavedViewRow | null> {
  const [row] = await forUser(userId)
    .update(savedViews, { ...patch, updatedAt: new Date().toISOString() }, eq(savedViews.id, id))
    .returning();
  return row ? toRow(row) : null;
}

export async function deleteSavedView(userId: string, id: string): Promise<boolean> {
  const rows = await forUser(userId).deleteFrom(savedViews, eq(savedViews.id, id)).returning({ id: savedViews.id });
  return rows.length > 0;
}
