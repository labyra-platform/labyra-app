/**
 * Next.js middleware — Origin header enforcement for CSRF defense.
 *
 * Runs at the edge before every matched route. On mutations (POST/PUT/PATCH/DELETE),
 * rejects requests whose Origin header is missing or not in the allowlist.
 *
 * Stage 1 approach per docs/labyra-strategy.md.
 *
 * @phase R162-security
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAllowedOrigin, MUTATION_METHODS } from '@/lib/security/origin';

export function middleware(req: NextRequest): NextResponse {
  if (!MUTATION_METHODS.has(req.method)) {
    return NextResponse.next();
  }

  // Webhook routes (verified by signature, no browser involvement) — skip Origin check.
  // Add specific paths here as webhooks are added.
  const path = req.nextUrl.pathname;
  if (path.startsWith('/api/webhooks/')) {
    return NextResponse.next();
  }

  const origin = req.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return new NextResponse('forbidden_origin', { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*']
};
