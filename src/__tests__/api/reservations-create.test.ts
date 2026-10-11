/**
 * @jest-environment node
 */

jest.mock('@/lib/db-mutations', () => ({
  createReservation: jest.fn(),
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn(() => false),
}));

import { POST } from '@/app/api/places/[id]/reservations/route';
import { createReservation } from '@/lib/db-mutations';
import { requireAuthForApi } from '@/lib/auth-helpers';
import type { NextRequest } from 'next/server';

const mockCreate = createReservation as jest.MockedFunction<typeof createReservation>;
const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;

function post(body: unknown) {
  const request = new Request('http://localhost/api/places/plc_1/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return POST(request, { params: Promise.resolve({ id: 'plc_1' }) });
}

describe('POST /api/places/[id]/reservations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: 'user_1', email: 'u@x', name: 'U', image: null } as Awaited<ReturnType<typeof requireAuthForApi>>);
    mockCreate.mockResolvedValue({ id: 'res_1' } as Awaited<ReturnType<typeof createReservation>>);
  });

  it('creates a reservation with only a date when the editors send null and empty optional fields', async () => {
    const response = await post({
      reservationDate: '2026-11-18',
      reservationTime: null,
      confirmationNumber: null,
      bookingPlatform: '',
      status: 'confirmed',
      notes: null,
      partySize: null,
      totalCost: null,
      bookingUrl: '',
      specialRequests: null,
    });

    expect(response.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(
      { placeId: 'plc_1', reservationDate: '2026-11-18', status: 'confirmed' },
      'user_1',
    );
  });

  it('still rejects a missing date and a malformed booking URL', async () => {
    expect((await post({ reservationDate: null })).status).toBe(400);
    expect((await post({ reservationDate: '2026-11-18', bookingUrl: 'not a url' })).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
