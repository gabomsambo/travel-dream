/**
 * @jest-environment node
 */
jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

import { NextRequest } from 'next/server';
import { GET as autocompleteGET } from '@/app/api/google-places/autocomplete/route';
import { GET as detailsGET } from '@/app/api/google-places/details/route';
import { requireAuthForApi } from '@/lib/auth-helpers';

const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  mockRequireAuth.mockResolvedValue({ id: 'user_1', email: 'u@x', name: 'U', image: null });
  global.fetch = jest.fn();
});

describe('Google Places language', () => {
  it('asks autocomplete for English predictions', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ZERO_RESULTS', predictions: [] }),
    });

    const res = await autocompleteGET(req('/api/google-places/autocomplete?input=Miradouro'));
    expect(res.status).toBe(200);

    const url = new URL((global.fetch as jest.Mock).mock.calls[0][0] as string);
    expect(url.searchParams.get('language')).toBe('en');
    expect(url.searchParams.get('input')).toBe('Miradouro');
  });

  it('asks place details for English address components', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        result: {
          place_id: 'place_1',
          name: 'Miradouro',
          formatted_address: 'Lisbon, Portugal',
          geometry: { location: { lat: 38.7, lng: -9.1 } },
          address_components: [
            { long_name: 'Lisbon', short_name: 'Lisbon', types: ['locality'] },
            { long_name: 'Portugal', short_name: 'PT', types: ['country'] },
          ],
        },
      }),
    });

    const res = await detailsGET(req('/api/google-places/details?placeId=place_1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.city).toBe('Lisbon');

    const url = new URL((global.fetch as jest.Mock).mock.calls[0][0] as string);
    expect(url.searchParams.get('language')).toBe('en');
    expect(url.searchParams.get('place_id')).toBe('place_1');
  });
});
