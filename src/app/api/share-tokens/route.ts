import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import {
  createShareToken,
  listShareTokens,
  MAX_ACTIVE_SHARE_TOKENS,
  SHARE_TOKEN_NAME_MAX,
} from '@/lib/phone-share-tokens';

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(SHARE_TOKEN_NAME_MAX),
});

const noStore = { 'Cache-Control': 'no-store' };

/** The caller's active share tokens (never the token values themselves). */
export async function GET() {
  try {
    const user = await requireAuthForApi();
    return NextResponse.json({ tokens: await listShareTokens(user.id) }, { headers: noStore });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    console.error('[Share Tokens] List failed:', error);
    return NextResponse.json({ error: 'Could not load share tokens' }, { status: 500 });
  }
}

/** Create a named token. The raw value is in this response and nowhere else, ever. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Give the token a name, up to 60 characters.', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const created = await createShareToken(user.id, parsed.data.name);
    if (!created.ok) {
      return NextResponse.json(
        { error: `You already have ${MAX_ACTIVE_SHARE_TOKENS} share tokens. Revoke one you no longer use first.` },
        { status: 409 },
      );
    }
    return NextResponse.json({ token: created.token, secret: created.raw }, { status: 201, headers: noStore });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    console.error('[Share Tokens] Create failed:', error);
    return NextResponse.json({ error: 'Could not create a share token' }, { status: 500 });
  }
}
