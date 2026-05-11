import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';

const handleI18nRouting = createMiddleware(routing);

/**
 * Combined proxy: next-intl locale routing + auth protection.
 *
 * Order of operations:
 * 1. Let next-intl resolve locale (may redirect to add missing prefix).
 * 2. If next-intl issued a redirect, return it immediately — auth check
 *    on a pre-redirect URL would clobber it and cause loops.
 * 3. Extract locale strictly from `routing.locales`. If pathname has
 *    no recognised locale prefix, defer to next-intl's response.
 * 4. Apply auth rules on the locale-stripped path.
 *
 * Routes protected: /[locale]/dashboard/*
 * Auth routes (redirect away if authed): /[locale]/sign-in, /[locale]/sign-up
 *
 * Edge runtime — cookie presence is checked but token verification happens
 * in Server Components via getCurrentUser().
 */
// R160-i18n-3e: trust next-intl redirects
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  // Step 1: locale routing
  const response = handleI18nRouting(request);

  // Step 2: if next-intl is redirecting (adding locale prefix, etc.), let it.
  // Status 3xx means a Location header is already set — don't second-guess.
  if (response.status >= 300 && response.status < 400) {
    return response;
  }

  const pathname = request.nextUrl.pathname;

  // Step 3: strict locale extraction. The first segment must be one of
  // `routing.locales` — anything else means no locale prefix is present.
  const firstSegment = pathname.split('/')[1];
  const locale = (routing.locales as readonly string[]).includes(firstSegment)
    ? firstSegment
    : null;

  // No recognised locale → next-intl's response already handles the redirect
  // (or it's a static asset matcher fall-through). Return as-is.
  if (!locale) {
    return response;
  }

  // Strip the leading `/${locale}` segment for path matching.
  const pathnameWithoutLocale = pathname.slice(`/${locale}`.length) || '/';

  const isAuthRoute =
    pathnameWithoutLocale.startsWith('/sign-in') || pathnameWithoutLocale.startsWith('/sign-up');
  const isProtectedRoute = pathnameWithoutLocale.startsWith('/dashboard');

  const sessionCookie = request.cookies.get('__session');

  // Authenticated user hitting an auth page → bounce to dashboard.
  if (sessionCookie && isAuthRoute) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  // Unauthenticated user hitting a protected page → bounce to sign-in,
  // remembering the original destination.
  if (!sessionCookie && isProtectedRoute) {
    const signInUrl = new URL(`/${locale}/sign-in`, request.url);
    signInUrl.searchParams.set('redirect', pathnameWithoutLocale);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  // Match all pathnames except for assets + api routes
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)']
};
