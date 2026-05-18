/**
 * Legacy /api/reference-cards/[id] → /api/references/[id]
 *
 * @phase R164-phase-6a
 * @deprecated Use /api/references/[id]. Will be removed in R166.
 */
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function redirectToReferences(req: NextRequest): NextResponse {
  const url = new URL(req.url);
  const target = new URL(
    url.pathname.replace('/api/reference-cards', '/api/references') + url.search,
    req.url
  );
  return NextResponse.redirect(target, 308);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return redirectToReferences(req);
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  return redirectToReferences(req);
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  return redirectToReferences(req);
}
