/**
 * @jest-environment node
 *
 * Add Place used to reject any Google place that carries opening hours.
 *
 * `/api/google-places/details` returns `hours: Record<string, string>` (the
 * shape the place-page hours editor also stores), and `add-place-dialog.tsx`
 * copies that object straight into the form and posts it. But the create
 * schema declared `hours: z.string()`, so the POST came back `400
 * "Validation failed"` for every restaurant, museum or shop that has hours —
 * which is most real places.
 *
 * This test posts the dialog's real payload shape against the real handler
 * backed by a real SQLite file (see `../helpers/tenant-fixture`), and asserts
 * the hours object round-trips into the row the way the rest of the app reads
 * it. The fixture import MUST stay first — it pins `TURSO_DATABASE_URL` to a
 * throwaway file before `@/db` is loaded.
 */
import {
  ALICE,
  assertLocalDatabase,
  resetTenantFixture,
  apiRequest,
  readCell,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));

import { requireAuthForApi } from '@/lib/auth-helpers';

// The hours object `/api/google-places/details` produces for a place that is
// open Mon–Sat and closed Sunday — the same shape `add-place-dialog.tsx`
// posts verbatim and `HoursEditor` stores.
const KINKAKUJI_HOURS: Record<string, string> = {
  monday: '09:00-17:00',
  tuesday: '09:00-17:00',
  wednesday: '09:00-17:00',
  thursday: '09:00-17:00',
  friday: '09:00-17:00',
  saturday: '09:00-17:00',
  sunday: 'closed',
};

// The exact body `add-place-dialog.tsx`'s `handleSubmit` posts, with a picked
// Google location that carries hours.
const DIALOG_PAYLOAD = {
  name: 'Kinkaku-ji',
  kind: 'landmark',
  description: null,
  googlePlaceId: 'ChIJexample_google_place_id',
  address: '1 Kinkakujicho, Kita Ward, Kyoto',
  city: 'Kyoto',
  admin: 'Kyoto Prefecture',
  country: 'Japan',
  coords: { lat: 35.0394, lon: 135.7292 },
  tags: null,
  vibes: null,
  activities: null,
  cuisine: null,
  amenities: null,
  website: null,
  phone: null,
  hours: KINKAKUJI_HOURS,
  price_level: null,
  best_time: null,
  notes: null,
  status: 'library',
  confidence: 1.0,
};

async function postPlace(body: unknown) {
  const mod = require('@/app/api/places/route') as {
    POST: (req: Request, ctx?: { params: Promise<unknown> }) => Promise<{ status: number; json: () => Promise<unknown> }>;
  };
  const res = await mod.POST(apiRequest('http://localhost/api/places', 'POST', body), {
    params: Promise.resolve({}),
  });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/places with a Google place that has opening hours', () => {
  beforeAll(async () => {
    assertLocalDatabase();
    // jest.setup.js pins `crypto.randomUUID` to a constant, which collides on
    // the `places` primary key as soon as a suite inserts more than one row.
    useUniqueUuids();
    await resetTenantFixture();
  });

  beforeEach(() => {
    (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
  });

  it('accepts the hours object the dialog sends and stores it as JSON', async () => {
    const res = await postPlace(DIALOG_PAYLOAD);

    expect(res.status).toBe(201);
    const created = res.body as { id: string; hours: Record<string, string> };
    expect(created.hours).toEqual(KINKAKUJI_HOURS);

    // The row in the database carries the same object — that is what the
    // place page, the export and the rest of the app read back. The raw
    // libSQL client returns the JSON column as a string, so parse it.
    const stored = await readCell('SELECT hours FROM places WHERE id = ?', [created.id]);
    expect(JSON.parse(stored as string)).toEqual(KINKAKUJI_HOURS);
  });

  it('still accepts a place with no hours (null) and a place with a string hours legacy value is not assumed', async () => {
    const noHours = await postPlace({ ...DIALOG_PAYLOAD, name: 'No Hours Cafe', hours: null });
    expect(noHours.status).toBe(201);
    expect((noHours.body as { hours: unknown }).hours).toBeNull();
  });

  it('rejects the old shape the schema never allowed: an hours value that is neither an object nor null', async () => {
    // A number is not a Record<string,string> and not null, so it must still 400.
    const res = await postPlace({ ...DIALOG_PAYLOAD, name: 'Bad Hours', hours: 42 });
    expect(res.status).toBe(400);
  });
});
