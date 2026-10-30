/**
 * The Library page's payload, decided on the server: the whole library for one
 * small enough to carry, otherwise only what the first screen shows plus the
 * version of the index that holds the rest (`/api/library/index`).
 */
import 'server-only';
import { buildFirstScreen, INLINE_LIMIT, type LibrarySeed } from './first-screen';
import { loadLibraryContent } from './load';
import { getHeartIds, listSavedViews } from './store';
import { libraryVersion } from './version';

export async function loadLibrarySeed(userId: string, params: URLSearchParams): Promise<LibrarySeed> {
  const [content, heartIds, savedViews] = await Promise.all([loadLibraryContent(userId), getHeartIds(userId), listSavedViews(userId)]);
  if (content.items.length <= INLINE_LIMIT) return { mode: 'inline', data: { userId, ...content, heartIds, savedViews } };

  // The version only names the index to fetch. The index route reads its own version before its own
  // rows, so what is cached under a version is never older than that version.
  const version = await libraryVersion(userId);
  return buildFirstScreen({ userId, version, ...content, heartIds, savedViews, params, now: new Date() });
}
