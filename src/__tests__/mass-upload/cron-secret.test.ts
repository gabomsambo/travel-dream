/**
 * @jest-environment node
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));
jest.mock('@/lib/db-queries', () => ({
  getQueuedSources: jest.fn(),
}));
jest.mock('@/lib/db-mutations', () => ({
  createPlacesFromPipeline: jest.fn(),
}));
jest.mock('@/lib/mass-upload/gemini-extraction-service', () => ({
  geminiExtractionService: { extractFromImage: jest.fn() },
}));
jest.mock('@/lib/mass-upload/google-places-enrichment', () => ({
  googlePlacesEnrichmentService: { enrichPlaces: jest.fn() },
}));

import { GET } from '@/app/api/mass-upload/cron/route';
import { db } from '@/db';
import { getQueuedSources } from '@/lib/db-queries';

const mockDb = db as unknown as { select: jest.Mock; update: jest.Mock };
const mockGetQueuedSources = getQueuedSources as jest.MockedFunction<typeof getQueuedSources>;

describe('CRON_SECRET security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: 'Bearer anything' },
    });
    const res = await GET(req as never);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain('Server configuration error');
  });

  it('accepts valid CRON_SECRET and returns 200', async () => {
    process.env.CRON_SECRET = 'valid-secret';
    process.env.GEMINI_VISION_ENABLED = 'true';

    // Stale check → empty
    const staleChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    };
    mockDb.select.mockReturnValueOnce(staleChain);

    mockGetQueuedSources.mockResolvedValue([]);

    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: 'Bearer valid-secret' },
    });
    const res = await GET(req as never);
    expect(res.status).toBe(200);
  });
});
