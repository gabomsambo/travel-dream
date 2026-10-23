import { NextResponse } from 'next/server';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { checkLibraryDuplicate } from '@/lib/review-duplicate-check';

export const runtime = 'nodejs';

/**
 * One place against the caller's Library. Review uses this for the inline
 * "Looks like … in your Library" note.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthForApi();
    const { id } = await params;
    const result = await checkLibraryDuplicate(user.id, id);
    if (result.status === 'missing') {
      return NextResponse.json(
        { status: 'error', message: 'Place not found' },
        { status: 404 },
      );
    }
    return NextResponse.json({ status: 'success', match: result.match });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[API] Duplicate check error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Duplicate check failed' },
      { status: 500 },
    );
  }
}
