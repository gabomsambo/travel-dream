/**
 * Personal share tokens — the credential an iPhone Shortcut sends as
 * `Authorization: Bearer <token>` to `POST /api/share/links`.
 *
 * - The raw token is returned once, by `createShareToken`, and never stored:
 *   the table keeps its SHA-256. A token is 32 random bytes, so a plain hash
 *   is enough; a slow password hash would only add latency to every share.
 * - Every token carries a scope. `authenticateShareToken` refuses a token used
 *   for a scope it was not issued for, and no session route reads tokens at
 *   all, so a leaked token can save links into one Inbox and do nothing else.
 * - Revoking keeps the row (with `revoked_at`) so a revoked token is reported
 *   as revoked rather than unknown.
 *
 * Management (`create` / `list` / `revoke`) goes through `forUser()`. Only
 * `authenticateShareToken` reads the table unscoped: it runs before there is a
 * user, exactly like sign-in, and its lookup key is the hash of a secret the
 * caller presented — it can only ever return the one row that secret names.
 */
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
// eslint-disable-next-line no-restricted-imports -- pre-authentication lookup by token hash; see the header comment
import { db } from '@/db';
import { shareTokens } from '@/db/schema';
import { forUser } from '@/lib/tenant-db';
import type { ShareTokenSummary } from '@/types/share-tokens';

export type { ShareTokenSummary };

export const SHARE_TOKEN_SCOPE_LINK_IMPORT = 'link-import';
export type ShareTokenScope = typeof SHARE_TOKEN_SCOPE_LINK_IMPORT;

/** Visible marker so a pasted token is recognisable (and greppable in leaks). */
const TOKEN_MARKER = 'td_share_';
/** How much of the raw token the settings list shows: the marker plus 4 characters. */
const PREFIX_LENGTH = TOKEN_MARKER.length + 4;
export const MAX_ACTIVE_SHARE_TOKENS = 20;
export const SHARE_TOKEN_NAME_MAX = 60;

export function hashShareToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function generateRawToken(): string {
  return `${TOKEN_MARKER}${randomBytes(32).toString('base64url')}`;
}

function toSummary(row: typeof shareTokens.$inferSelect): ShareTokenSummary {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scope: row.scope,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export async function listShareTokens(userId: string): Promise<ShareTokenSummary[]> {
  const rows = await forUser(userId)
    .select(shareTokens, isNull(shareTokens.revokedAt))
    .orderBy(desc(shareTokens.createdAt), desc(shareTokens.id));
  return rows.map(toSummary);
}

export type CreateShareTokenResult =
  | { ok: true; token: ShareTokenSummary; raw: string }
  | { ok: false; reason: 'too-many' };

export async function createShareToken(userId: string, name: string): Promise<CreateShareTokenResult> {
  const tdb = forUser(userId);
  const active = await tdb.selectFields(shareTokens, { id: shareTokens.id }, isNull(shareTokens.revokedAt));
  if (active.length >= MAX_ACTIVE_SHARE_TOKENS) return { ok: false, reason: 'too-many' };

  const raw = generateRawToken();
  const [row] = await tdb.insert(shareTokens, {
    name: name.trim().slice(0, SHARE_TOKEN_NAME_MAX),
    tokenHash: hashShareToken(raw),
    tokenPrefix: raw.slice(0, PREFIX_LENGTH),
    scope: SHARE_TOKEN_SCOPE_LINK_IMPORT,
    createdAt: new Date().toISOString(),
  }).returning();
  return { ok: true, token: toSummary(row), raw };
}

/** Revoke one of the caller's own active tokens. False when there is no such token. */
export async function revokeShareToken(userId: string, tokenId: string): Promise<boolean> {
  const revoked = await forUser(userId)
    .update(
      shareTokens,
      { revokedAt: new Date().toISOString() },
      and(eq(shareTokens.id, tokenId), isNull(shareTokens.revokedAt)),
    )
    .returning({ id: shareTokens.id });
  return revoked.length > 0;
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  return match ? match[1] : null;
}

export type ShareTokenAuth =
  | { ok: true; userId: string; tokenId: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'revoked' };

/**
 * Resolve a presented token to its owner, for `scope` only, and record the
 * use. Unknown, malformed, wrong-scope and revoked tokens all fail.
 */
export async function authenticateShareToken(
  raw: string | null,
  scope: ShareTokenScope,
): Promise<ShareTokenAuth> {
  if (!raw) return { ok: false, reason: 'missing' };
  if (!raw.startsWith(TOKEN_MARKER) || raw.length > 200) return { ok: false, reason: 'invalid' };

  const [row] = await db
    .select({
      id: shareTokens.id,
      userId: shareTokens.userId,
      scope: shareTokens.scope,
      revokedAt: shareTokens.revokedAt,
    })
    .from(shareTokens)
    .where(eq(shareTokens.tokenHash, hashShareToken(raw)))
    .limit(1);

  if (!row || row.scope !== scope) return { ok: false, reason: 'invalid' };
  if (row.revokedAt) return { ok: false, reason: 'revoked' };

  await forUser(row.userId).update(
    shareTokens,
    { lastUsedAt: new Date().toISOString() },
    eq(shareTokens.id, row.id),
  );
  return { ok: true, userId: row.userId, tokenId: row.id };
}
