import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js 16 proxy (renamed from middleware) — auth protection.
 *
 * Note: Firebase Auth ID token verification chỉ work trong Node.js runtime,
 * không phải Edge runtime. Proxy này chỉ check session cookie existence.
 * Full token verification ở Server Components qua getCurrentUser() từ
 * '@/lib/auth/server'.
 *
 * Protected routes: /dashboard/*
 * Auth routes (redirect away if authed): /sign-in, /sign-up
 */
export function proxy(request: NextRequest): NextResponse {
  const sessionCookie = request.cookies.get('__session');
  const isAuthRoute =
    request.nextUrl.pathname.startsWith('/sign-in') ||
    request.nextUrl.pathname.startsWith('/sign-up');
  const isProtectedRoute = request.nextUrl.pathname.startsWith('/dashboard');

  // Redirect authenticated users away from auth pages
  if (sessionCookie && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Redirect unauthenticated users to sign-in
  if (!sessionCookie && isProtectedRoute) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
