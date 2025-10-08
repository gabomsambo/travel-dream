import { NextRequest, NextResponse } from 'next/server';
import { createReservation } from '@/lib/db-mutations';
import { z } from 'zod';

export const runtime = 'nodejs';

const ReservationSchema = z.object({
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  reservationTime: z.string().optional(),
  confirmationNumber: z.string().optional(),
  status: z.enum(['confirmed', 'pending', 'cancelled', 'completed']).optional(),
  partySize: z.number().int().positive().optional(),
  bookingPlatform: z.string().optional(),
  bookingUrl: z.string().url().optional(),
  specialRequests: z.string().optional(),
  totalCost: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: placeId } = await params;
    const body = await request.json();

    const validatedData = ReservationSchema.parse(body);

    const reservation = await createReservation({
      placeId,
      ...validatedData,
    });

    return NextResponse.json({
      status: 'success',
      reservation,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        },
        { status: 400 }
      );
    }

    console.error('Reservation creation error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to create reservation',
      },
      { status: 500 }
    );
  }
}
