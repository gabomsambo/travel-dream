import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import {
  checkRateLimit,
  getClientIdentifier,
  getRouteTier,
  rateLimitResponse,
} from '@/lib/rate-limit';

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isStaticOrApi =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth/callback') ||
    pathname.includes('.');

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
