import type { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';

export const { GET } = handlers;

/**
 * Signing out also empties the browser's HTTP cache for this origin. The
 * Library keeps the user's whole index there (`private, immutable`, so a revisit
 * is free); on a shared browser the next account must not be able to read it.
 */
export async function POST(request: NextRequest) {
  const response = await handlers.POST(request);
  if (request.nextUrl.pathname.endsWith('/signout')) {
    response.headers.set('Clear-Site-Data', '"cache"');
  }
  return response;
}
