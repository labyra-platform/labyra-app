import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';

const handleI18nRouting = createMiddleware(routing);

/**
 * Combined proxy: next-intl locale routing + auth protection.
 *
 * Order matters:
 * 1. next-intl handles locale detection + URL rewrite first
 * 2. Auth check runs after locale resolution
 *
 * Routes protected: /[locale]/dashboard/*
 * Auth routes (redirect away if authed): /[locale]/sign-in, /[locale]/sign-up
 *
 * Note: Edge runtime — chỉ check cookie existence.
 * Full token verification ở Server Components qua getCurrentUser().
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  // Step 1: Let next-intl handle locale routing first
  const response = handleI18nRouting(request);

  // Step 2: Auth checks (only after locale resolved)
  const sessionCookie = request.cookies.get('__session');
  const pathname = request.nextUrl.pathname;

  // Strip locale prefix for path matching
  const pathnameWithoutLocale = routing.locales.find((locale) => pathname.startsWith(`/${locale}/`))
    ? pathname.replace(/^\/[^/]+/, '')
    : pathname;

  const isAuthRoute =
    pathnameWithoutLocale.startsWith('/sign-in') || pathnameWithoutLocale.startsWith('/sign-up');
  const isProtectedRoute = pathnameWithoutLocale.startsWith('/dashboard');

  // Redirect authenticated users away from auth pages
  if (sessionCookie && isAuthRoute) {
    const locale = pathname.split('/')[1] || routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  // Redirect unauthenticated users to sign-in
  if (!sessionCookie && isProtectedRoute) {
    const locale = pathname.split('/')[1] || routing.defaultLocale;
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
