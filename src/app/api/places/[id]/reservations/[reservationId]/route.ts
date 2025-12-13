import { NextRequest, NextResponse } from 'next/server';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { z } from 'zod';

const ReservationUpdateSchema = z.object({
  reservationDate: z.string().optional(),
  reservationTime: z.string().nullable().optional(),
  confirmationNumber: z.string().max(200).nullable().optional(),
  bookingPlatform: z.string().max(100).nullable().optional(),
  status: z.string().max(50).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reservationId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { reservationId } = await params;
    const body = await request.json();

    const validation = ReservationUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid data' },
        { status: 400 }
      );
    }

    const { updateReservation } = await import('@/lib/db-mutations');
    const updated = await updateReservation(reservationId, validation.data, user.id);

    return NextResponse.json({
      status: 'success',
      reservation: updated,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json(
      { status: 'error', message: 'Failed to update reservation' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reservationId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { reservationId } = await params;
    const { deleteReservation } = await import('@/lib/db-mutations');
    await deleteReservation(reservationId, user.id);

    return NextResponse.json({
      status: 'success',
      message: 'Reservation deleted',
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json(
      { status: 'error', message: 'Failed to delete reservation' },
      { status: 500 }
    );
  }
}
