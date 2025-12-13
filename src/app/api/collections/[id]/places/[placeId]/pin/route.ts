import { NextRequest, NextResponse } from 'next/server';
import { togglePlacePin } from '@/lib/db-mutations';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; placeId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id, placeId } = await params;
    await togglePlacePin(id, placeId, user.id);

    return NextResponse.json({
      status: 'success',
      message: 'Pin toggled',
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json(
      { status: 'error', message: 'Failed to toggle pin' },
      { status: 500 }
    );
  }
}
