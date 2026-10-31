import { NextResponse } from 'next/server';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { libraryVersion } from '@/lib/library/version';

export const runtime = 'nodejs';

/**
 * The caller's current Library version: the key of the index to fetch. The
 * browser asks after it has edited the library, so it can tell whether the index
 * it holds is still the server's without downloading it. Never cached: the
 * answer is the point.
 */
export async function GET() {
  try {
    const user = await requireAuthForApi();
    return NextResponse.json({ version: await libraryVersion(user.id) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[API] Library version error:', error);
    return NextResponse.json({ error: 'Failed to read the library version' }, { status: 500 });
  }
}
