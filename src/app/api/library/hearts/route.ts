import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { setHearts } from '@/lib/library/store';

/**
 * Hearts or un-hearts places on the caller's account. The same call carries a
 * device's one-time sync of its old localStorage hearts, which is why ids that
 * are not (or no longer) the caller's places are skipped rather than refused.
 */
const HeartsSchema = z.object({
  placeIds: z.array(z.string().min(1).max(200)).min(1).max(1000),
  on: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const { placeIds, on } = HeartsSchema.parse(await request.json());
    const applied = await setHearts(user.id, placeIds, on);
    return NextResponse.json({ status: 'success', on, placeIds: applied });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ status: 'error', message: 'Invalid request' }, { status: 400 });
    }
    console.error('Error saving hearts:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to save hearts' }, { status: 500 });
  }
}
