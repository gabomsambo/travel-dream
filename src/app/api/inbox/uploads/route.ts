import { NextResponse } from 'next/server';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { getInboxUploads } from '@/lib/inbox-uploads';
import type { InboxUploadsResponse } from '@/types/inbox-uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The signed-in user's mass uploads, one entry per batch, newest first, with
 * what happened to every screenshot and place. Shape: `InboxUploadsResponse`.
 */
export async function GET() {
  try {
    const user = await requireAuthForApi();
    const summary = await getInboxUploads(user.id);
    const body: InboxUploadsResponse = { status: 'success', ...summary };
    return NextResponse.json(body);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Inbox Uploads] Error:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to load uploads' }, { status: 500 });
  }
}
