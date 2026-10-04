import { NextRequest, NextResponse } from 'next/server';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { setPrimaryPhoto } from '@/lib/place-photos';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: placeId, attachmentId } = await params;

    if (!(await setPrimaryPhoto(user.id, placeId, attachmentId))) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Failed to set primary image:', error);
    return NextResponse.json(
      { error: 'Failed to set primary image' },
      { status: 500 }
    );
  }
}
