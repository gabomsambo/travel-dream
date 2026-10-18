import {
  ALICE,
  BOB,
  assertLocalDatabase,
  resetTenantFixture,
} from '@/__tests__/helpers/tenant-fixture';
import {
  countScreenshotStatuses,
  resolveScreenshotDisplayStatus,
  screenshotStatusLabel,
} from '@/lib/inbox-screenshot-status';
import { getInboxStats } from '@/lib/db-queries';
import { render, screen } from '@testing-library/react';
import { ScreenshotCard } from '@/components/inbox/screenshot-card';

jest.mock('@/lib/notify', () => ({
  notify: { error: jest.fn(), success: jest.fn() },
}));

describe('inbox pending fix', () => {
  beforeAll(() => {
    assertLocalDatabase();
  });

  beforeEach(async () => {
    await resetTenantFixture();
  });

  describe('screenshot display status', () => {
    it('maps mass-upload pipeline states and labels', () => {
      expect(
        resolveScreenshotDisplayStatus({
          processingStatus: 'completed',
          meta: { uploadInfo: { ocrStatus: 'pending' } },
        })
      ).toBe('done');
      expect(screenshotStatusLabel('done')).toBe('Done');

      expect(
        resolveScreenshotDisplayStatus({ processingStatus: 'extracting', meta: {} })
      ).toBe('reading');
      expect(screenshotStatusLabel('reading')).toBe('Reading…');

      expect(
        resolveScreenshotDisplayStatus({ processingStatus: 'failed', meta: {} })
      ).toBe('failed');
      expect(screenshotStatusLabel('failed')).toBe("Couldn't read");

      expect(
        resolveScreenshotDisplayStatus({ processingStatus: 'queued', meta: {} })
      ).toBe('waiting');
      expect(screenshotStatusLabel('waiting')).toBe('Waiting');
    });

    it('falls back to legacy ocrStatus when processing_status stayed pending', () => {
      expect(
        resolveScreenshotDisplayStatus({
          processingStatus: 'pending',
          meta: { uploadInfo: { ocrStatus: 'completed' } },
        })
      ).toBe('done');

      expect(
        resolveScreenshotDisplayStatus({
          processingStatus: 'pending',
          meta: { uploadInfo: { ocrStatus: 'processing' } },
        })
      ).toBe('reading');

      expect(
        resolveScreenshotDisplayStatus({
          processingStatus: 'pending',
          meta: { uploadInfo: { ocrStatus: 'failed' } },
        })
      ).toBe('failed');
    });

    it('counts processed screenshots from pipeline and legacy rows', () => {
      const counts = countScreenshotStatuses([
        {
          processingStatus: 'completed',
          meta: { uploadInfo: { ocrStatus: 'pending' } },
        },
        {
          processingStatus: 'pending',
          meta: { uploadInfo: { ocrStatus: 'completed' } },
        },
        {
          processingStatus: 'extracting',
          meta: { uploadInfo: { ocrStatus: 'pending' } },
        },
        {
          processingStatus: 'failed',
          meta: { uploadInfo: { ocrStatus: 'pending' } },
        },
      ]);

      expect(counts.done).toBe(2);
      expect(counts.reading).toBe(1);
      expect(counts.failed).toBe(1);
    });
  });

  describe('getInboxStats needsReview', () => {
    async function insertInboxPlace(
      id: string,
      userId: string,
      confidence: number | null
    ): Promise<void> {
      const { client } = require('@/db') as {
        client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
      };
      const now = new Date().toISOString();
      await client.execute({
        sql: `INSERT INTO places (id,user_id,name,kind,status,confidence,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [id, userId, `Place ${id}`, 'cafe', 'inbox', confidence, now, now],
      });
    }

    it('counts all inbox places for the user, not an estimate', async () => {
      await insertInboxPlace('plc_inbox_a', ALICE.id, 0.95);
      await insertInboxPlace('plc_inbox_b', ALICE.id, 0.4);
      await insertInboxPlace('plc_inbox_c', ALICE.id, 0.85);
      await insertInboxPlace('plc_bob_inbox', BOB.id, 0.2);

      const aliceStats = await getInboxStats(ALICE.id);
      expect(aliceStats.total).toBe(3);
      expect(aliceStats.needsReview).toBe(3);

      const bobStats = await getInboxStats(BOB.id);
      expect(bobStats.total).toBe(1);
      expect(bobStats.needsReview).toBe(1);
    });
  });

  describe('ScreenshotCard badge', () => {
    const baseSource = {
      id: 'src_test',
      uri: 'https://example.com/shot.png',
      ocrText: null,
      createdAt: new Date().toISOString(),
      meta: { uploadInfo: { originalName: 'trip.png', ocrStatus: 'pending' } },
    };

    it('shows Done when mass upload completed despite stale ocrStatus', () => {
      render(
        <ScreenshotCard
          source={{ ...baseSource, processingStatus: 'completed' }}
        />
      );
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('shows legacy Done from ocrStatus when processing_status is pending', () => {
      render(
        <ScreenshotCard
          source={{
            ...baseSource,
            processingStatus: 'pending',
            meta: { uploadInfo: { originalName: 'trip.png', ocrStatus: 'completed' } },
          }}
        />
      );
      expect(screen.getByText('Done')).toBeInTheDocument();
    });
  });
});
