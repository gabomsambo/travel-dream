import { NextResponse } from 'next/server';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { revokeShareToken } from '@/lib/phone-share-tokens';

/** Revoke one of the caller's tokens. Another user's id is indistinguishable from a missing one. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthForApi();
    const { id } = await params;
    const revoked = await revokeShareToken(user.id, id);
    if (!revoked) return NextResponse.json({ error: 'Share token not found' }, { status: 404 });
    return NextResponse.json({ revoked: true, id });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    console.error('[Share Tokens] Revoke failed:', error);
    return NextResponse.json({ error: 'Could not revoke the share token' }, { status: 500 });
  }
}
