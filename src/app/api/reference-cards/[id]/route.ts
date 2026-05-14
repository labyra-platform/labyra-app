/**
 * GET    /api/reference-cards/[id] — get single card (tenant-scoped)
 * PATCH  /api/reference-cards/[id] — update metadata fields (R162)
 * DELETE /api/reference-cards/[id] — delete card (tenant-scoped)
 *
 * Rate limits (mutation tier):
 *   PATCH, DELETE → 30/min/tenant (R162-tier-rate-limit)
 *   GET → no rate limit (read tier, low-cost)
 *
 * @phase R160-spectra-4a-pdf, edit added R162-refcard-edit
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthService } from '@/lib/firebase/admin';
import {
  getReferenceCard,
  deleteReferenceCard,
  updateReferenceCard
} from '@/lib/firebase/reference-cards/service';
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

const PatchSchema = z.object({
  phaseName: z.string().min(1).max(200).optional(),
  formula: z.string().max(100).optional(),
  anode: z.string().max(20).optional(),
  spaceGroup: z.string().max(50).optional(),
  notes: z.string().max(2000).optional()
});

async function applyMutationRateLimit(tenantId: string) {
  const rl = await checkRateLimit(rateLimitKey('refcards-edit', tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const { id } = await params;

  const card = await getReferenceCard(auth.tenantId!, id);
  if (!card) return new NextResponse('not_found', { status: 404 });
  return NextResponse.json(card);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const limited = await applyMutationRateLimit(auth.tenantId!);
  if (limited) return limited;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse('invalid_json', { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const updated = await updateReferenceCard(auth.tenantId!, id, parsed.data);
  if (!updated) return new NextResponse('not_found', { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const limited = await applyMutationRateLimit(auth.tenantId!);
  if (limited) return limited;

  const { id } = await params;
  const card = await getReferenceCard(auth.tenantId!, id);
  if (!card) return new NextResponse('not_found', { status: 404 });

  await deleteReferenceCard(auth.tenantId!, id);
  return new NextResponse(null, { status: 204 });
}
