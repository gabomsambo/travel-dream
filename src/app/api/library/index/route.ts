import { NextResponse } from 'next/server';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { loadLibraryContent } from '@/lib/library/load';
import { libraryVersion } from '@/lib/library/version';
import { encodeIndex } from '@/lib/library/wire';

export const runtime = 'nodejs';

/** A year: the URL names the version, so the answer under it never changes. */
const IMMUTABLE = 'private, max-age=31536000, immutable';

/**
 * The caller's Library index — every place and collection, slimmed for the
 * wire — under the version that names it, so the browser keeps it and a revisit
 * of an unchanged library costs no transfer.
 *
 * The version is read before the rows, so the rows are at least as new as the
 * version they are labelled with. The caller asks for `?v=` what the page told
 * them; when the library has moved on since, they still get the current index
 * (labelled with its own version), but not as a cacheable answer under the old
 * URL. `private`, and the version digests the user id, so a shared browser
 * never serves one account's index to another.
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuthForApi();
    const version = await libraryVersion(user.id);
    const { items, collections } = await loadLibraryContent(user.id);
    const requested = new URL(request.url).searchParams.get('v');
    return NextResponse.json(encodeIndex({ version, items, collections }), {
      headers: { 'Cache-Control': requested === version ? IMMUTABLE : 'private, no-store' },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[API] Library index error:', error);
    return NextResponse.json({ error: 'Failed to load the library' }, { status: 500 });
  }
}
