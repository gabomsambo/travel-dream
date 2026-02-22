import { NextRequest, NextResponse } from 'next/server';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { GET as cronHandler } from '../cron/route';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await requireAuthForApi();

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not set in .env.local' },
        { status: 500 }
      );
    }

    // Call the cron handler directly (avoids self-referencing HTTP call)
    const fakeReq = new NextRequest('http://localhost:3000/api/mass-upload/cron', {
      headers: { 'Authorization': `Bearer ${cronSecret}` },
    });
    const result = await cronHandler(fakeReq);
    const data = await result.json();
    return NextResponse.json(data, { status: result.status });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Dev Trigger] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Dev trigger failed' },
      { status: 500 }
    );
  }
}
