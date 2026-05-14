/**
 * POST /api/reference-cards — create from already-parsed peaks
 * GET  /api/reference-cards  — list current tenant's cards
 *
 * Security:
 * - require Firebase auth + tenantId claim
 * - validate input via Zod
 * - tenant isolation (always scope by decoded.tenantId)
 *
 * @phase R160-spectra-4a-pdf
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { CreateReferenceCardSchema } from '@/lib/spectra/reference-card-schema';
import { createReferenceCard, listReferenceCards } from '@/lib/firebase/reference-cards/service';
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
    return { tenantId, uid: decoded.uid };
  } catch {
    return { error: new NextResponse('invalid_token', { status: 401 }) };
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  // R162-tier-rate-limit — per-tenant rate limit
  const rl = await checkRateLimit(rateLimitKey('refcards-write', auth.tenantId!), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  const body = await req.json();
  const parsed = CreateReferenceCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const card = await createReferenceCard({
    ...parsed.data,
    tenantId: auth.tenantId!,
    createdBy: auth.uid!
  });
  return NextResponse.json(card, { status: 201 });
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const formula = req.nextUrl.searchParams.get('formula') ?? undefined;
  const cards = await listReferenceCards(auth.tenantId!, formula ? { formula } : undefined);
  return NextResponse.json({ cards });
}
