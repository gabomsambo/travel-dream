import { NextRequest, NextResponse } from 'next/server';
import { togglePlacePin } from '@/lib/db-mutations';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; placeId: string }> }
) {
  try {
    const { id, placeId } = await params;
    await togglePlacePin(id, placeId);

    return NextResponse.json({
      status: 'success',
      message: 'Pin toggled',
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Failed to toggle pin' },
      { status: 500 }
    );
  }
}
