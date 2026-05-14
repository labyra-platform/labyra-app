/**
 * GET    /api/reference-cards/[id] — get single card (tenant-scoped)
 * DELETE /api/reference-cards/[id] — delete card (tenant-scoped)
 *
 * @phase R160-spectra-4a-pdf
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { getReferenceCard, deleteReferenceCard } from '@/lib/firebase/reference-cards/service';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: new NextResponse('unauthorized', { status: 401 }) };
  }
  try {
    const decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
    const tenantId = getTenantIdFromToken(decoded);
    if (!tenantId) return { error: new NextResponse('no_tenant', { status: 403 }) };
    return { tenantId };
  } catch {
    return { error: new NextResponse('invalid_token', { status: 401 }) };
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  // R162-tier-rate-limit — per-tenant rate limit
  const rl = await checkRateLimit(rateLimitKey('refcards-edit', auth.tenantId!), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }
  const { id } = await params;

  const card = await getReferenceCard(auth.tenantId!, id);
  if (!card) return new NextResponse('not_found', { status: 404 });
  return NextResponse.json(card);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const { id } = await params;

  // Verify card belongs to tenant (defense in depth — service already scopes)
  const card = await getReferenceCard(auth.tenantId!, id);
  if (!card) return new NextResponse('not_found', { status: 404 });

  await deleteReferenceCard(auth.tenantId!, id);
  return new NextResponse(null, { status: 204 });
}
