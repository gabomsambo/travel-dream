import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';
import { NextResponse } from 'next/server';
import {
  checkRateLimit,
  getClientIdentifier,
  getRouteTier,
  rateLimitResponse,
} from '@/lib/rate-limit';

// Build a middleware-only NextAuth instance from the edge-safe config. Importing
// `auth` from '@/lib/auth' instead would pull Drizzle, libSQL and bcrypt into the
// bundle that runs on every request. The adapter is not needed here: the session
// strategy is JWT, so middleware only ever decodes the token.
const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  // Check a concrete user property, not just `req.auth` existence: an Auth.js
  // config error surfaces as a truthy error-shaped auth object, which would
  // make a bare `!!req.auth` check fail open (GHSA-8fpg-xm3f-6cx3). Mirrors
  // the same check used by getCurrentUser() in lib/auth-helpers.
  const isLoggedIn = !!req.auth?.user?.id;

  const isStaticOrApi =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth/callback') ||
    pathname.includes('.');

  // Cron endpoints handle their own auth via CRON_SECRET header — bypass
  // both NextAuth session check AND rate limiting (system-to-system call)
  if (pathname.startsWith('/api/mass-upload/cron')) {
    return NextResponse.next();
  }

  if (isStaticOrApi) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/callback')) {
    const userId = req.auth?.user?.id;
    const identifier = getClientIdentifier(req, userId);
    const tier = getRouteTier(pathname, userId);

    const result = await checkRateLimit(identifier, tier);

    if (!result.success) {
      console.warn(`[RateLimit] Blocked ${identifier} on ${pathname} (tier: ${tier})`);
      return rateLimitResponse(result);
    }
  }

  const publicPaths = ['/', '/login', '/signup', '/api/auth'];
  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  if (isPublicPath) {
    if (isLoggedIn && (pathname === '/login' || pathname === '/signup')) {
      return NextResponse.redirect(new URL('/inbox', req.url));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.svg$|.*\\.webp$).*)',
  ],
};
