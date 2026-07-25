/**
 * @jest-environment node
 *
 * Attachment routes must authorize, not just authenticate: an attachment is
 * only reachable through a place the caller owns.
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { select: jest.fn(), delete: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

jest.mock('@vercel/blob', () => ({
  del: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { DELETE } from '@/app/api/places/[id]/attachments/[attachmentId]/route';
import { PUT } from '@/app/api/places/[id]/attachments/[attachmentId]/primary/route';
import { db } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { del } from '@vercel/blob';
import { createMockUser } from '../helpers/mass-upload-helpers';
import { mockSelect, mockDelete, whereMentions } from '../helpers/authz-helpers';

const mockDb = db as unknown as {
  select: jest.Mock;
  delete: jest.Mock;
  update: jest.Mock;
  transaction: jest.Mock;
};
const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;
const mockBlobDel = del as jest.MockedFunction<typeof del>;

const OWNER = createMockUser({ id: 'user_owner' });
const PLACE_ID = 'plc_owned-by-owner';
const ATTACHMENT_ID = 'att_owned-by-owner';

function params() {
  return { params: Promise.resolve({ id: PLACE_ID, attachmentId: ATTACHMENT_ID }) };
}

function req(url: string) {
  return new Request(url, { method: 'POST' }) as never;
}

describe('attachment ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(OWNER);
  });

  describe('DELETE /api/places/[id]/attachments/[attachmentId]', () => {
    it('rejects unauthenticated request', async () => {
      mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

      const res = await DELETE(req('http://localhost:3000/x'), params());

      expect(res.status).toBe(401);
    });

    it("returns 404 for another user's attachment and deletes nothing", async () => {
      // The ownership-scoped lookup matches no row for a non-owner
      const select = mockSelect([]);
      mockDb.select.mockReturnValue(select.chain);
      mockDb.delete.mockReturnValue(mockDelete());

      const res = await DELETE(req('http://localhost:3000/x'), params());

      expect(res.status).toBe(404);
      expect(mockDb.delete).not.toHaveBeenCalled();
      expect(mockBlobDel).not.toHaveBeenCalled();
    });

    it('scopes the attachment lookup to the calling user', async () => {
      const select = mockSelect([]);
      mockDb.select.mockReturnValue(select.chain);
      mockDb.delete.mockReturnValue(mockDelete());

      await DELETE(req('http://localhost:3000/x'), params());

      expect(select.conditions).toHaveLength(1);
      expect(whereMentions(select.conditions[0], OWNER.id)).toBe(true);
      expect(whereMentions(select.conditions[0], ATTACHMENT_ID)).toBe(true);
    });

    it('still deletes the attachment for its owner', async () => {
      const select = mockSelect([
        {
          id: ATTACHMENT_ID,
          uri: 'https://teststore.public.blob.vercel-storage.com/a.jpg',
          thumbnailUri: null,
        },
      ]);
      mockDb.select.mockReturnValue(select.chain);
      const del = mockDelete();
      mockDb.delete.mockReturnValue(del);

      const res = await DELETE(req('http://localhost:3000/x'), params());
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockDb.delete).toHaveBeenCalledTimes(1);
      expect(del.where).toHaveBeenCalledTimes(1);
    });
  });

  describe('PUT /api/places/[id]/attachments/[attachmentId]/primary', () => {
    it('rejects unauthenticated request', async () => {
      mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

      const res = await PUT(req('http://localhost:3000/x'), params());

      expect(res.status).toBe(401);
    });

    it("returns 404 for another user's attachment and writes nothing", async () => {
      const select = mockSelect([]);
      mockDb.select.mockReturnValue(select.chain);

      const res = await PUT(req('http://localhost:3000/x'), params());

      expect(res.status).toBe(404);
      // The isPrimary reset must never run against a place the caller does not own
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('scopes the attachment lookup to the calling user', async () => {
      const select = mockSelect([]);
      mockDb.select.mockReturnValue(select.chain);

      await PUT(req('http://localhost:3000/x'), params());

      expect(select.conditions).toHaveLength(1);
      expect(whereMentions(select.conditions[0], OWNER.id)).toBe(true);
    });

    it('still sets the primary image for its owner', async () => {
      const select = mockSelect([{ id: ATTACHMENT_ID }]);
      mockDb.select.mockReturnValue(select.chain);
      mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(undefined),
            }),
          }),
        })
      );

      const res = await PUT(req('http://localhost:3000/x'), params());
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });
  });
});
