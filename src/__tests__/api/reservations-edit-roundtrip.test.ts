/**
 * @jest-environment node
 *
 * Reservation add-then-edit, the way both editors drive it: POST with only a
 * date (every empty optional field sent as null or ""), then PATCH the fields
 * that could not be edited before. Runs the real handlers against the tenant
 * fixture's SQLite database and asserts on the persisted row.
 */
import {
  ALICE,
  BOB,
  FIXTURE,
  apiRequest,
  assertLocalDatabase,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));

import { requireAuthForApi } from '@/lib/auth-helpers';
import { POST } from '@/app/api/places/[id]/reservations/route';
import { PATCH } from '@/app/api/places/[id]/reservations/[reservationId]/route';

type Client = { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> };
const row = async (id: string) =>
  (
    await (require('@/db') as { client: Client }).client.execute({
      sql: `SELECT reservation_date, reservation_time, status, party_size, booking_url,
                   special_requests, total_cost, notes
            FROM reservations WHERE id = ?`,
      args: [id],
    })
  ).rows[0];

const placeId = FIXTURE.alicePlace;
const asUser = (user: typeof ALICE | typeof BOB) =>
  (requireAuthForApi as jest.Mock).mockResolvedValue(user);

describe('reservation add then edit (real database)', () => {
  beforeAll(() => {
    assertLocalDatabase();
    useUniqueUuids();
  });
  beforeEach(async () => {
    await resetTenantFixture();
    asUser(ALICE);
  });

  it('adds with only a date, then edits party size, booking URL, special requests and total cost', async () => {
    const created = await POST(
      apiRequest(`http://localhost/api/places/${placeId}/reservations`, 'POST', {
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
      }) as never,
      { params: Promise.resolve({ id: placeId }) },
    );
    expect(created.status).toBe(200);
    const { reservation } = (await created.json()) as { reservation: { id: string } };
    expect(await row(reservation.id)).toMatchObject({
      reservation_date: '2026-11-18',
      party_size: null,
      booking_url: null,
    });

    const edited = await PATCH(
      apiRequest(`http://localhost/api/places/${placeId}/reservations/${reservation.id}`, 'PATCH', {
        reservationDate: '2026-11-19',
        reservationTime: '19:30',
        status: 'pending',
        partySize: 4,
        bookingUrl: 'https://resy.com/cities/kyoto/bar-leone',
        specialRequests: 'Counter seats',
        totalCost: '$180',
        notes: null,
      }) as never,
      { params: Promise.resolve({ id: placeId, reservationId: reservation.id }) },
    );
    expect(edited.status).toBe(200);
    expect(await row(reservation.id)).toEqual({
      reservation_date: '2026-11-19',
      reservation_time: '19:30',
      status: 'pending',
      party_size: 4,
      booking_url: 'https://resy.com/cities/kyoto/bar-leone',
      special_requests: 'Counter seats',
      total_cost: '$180',
      notes: null,
    });

    // Clearing the booking URL from the form sends "", which must store NULL, not fail.
    const cleared = await PATCH(
      apiRequest(`http://localhost/api/places/${placeId}/reservations/${reservation.id}`, 'PATCH', {
        bookingUrl: '',
        partySize: null,
      }) as never,
      { params: Promise.resolve({ id: placeId, reservationId: reservation.id }) },
    );
    expect(cleared.status).toBe(200);
    expect(await row(reservation.id)).toMatchObject({ booking_url: null, party_size: null, total_cost: '$180' });
  });

  it("does not let another user edit the reservation", async () => {
    const created = await POST(
      apiRequest(`http://localhost/api/places/${placeId}/reservations`, 'POST', { reservationDate: '2026-11-18' }) as never,
      { params: Promise.resolve({ id: placeId }) },
    );
    const { reservation } = (await created.json()) as { reservation: { id: string } };

    asUser(BOB);
    const attempt = await PATCH(
      apiRequest(`http://localhost/api/places/${placeId}/reservations/${reservation.id}`, 'PATCH', { partySize: 9 }) as never,
      { params: Promise.resolve({ id: placeId, reservationId: reservation.id }) },
    );
    expect(attempt.status).not.toBe(200);
    expect(await row(reservation.id)).toMatchObject({ party_size: null });
  });
});
