/**
 * GET/PUT /api/tenant/ai-context — tenant-shared AI context (ADR-035 L4).
 *
 * Stored at tenants/{tid}/aiContext/main. Read: any tenant member. Write: admin
 * only (authenticateAdmin). tenantId comes from the token, never the body.
 *
 * @phase R192-mem-m1b
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate, authenticateAdmin } from '@/lib/api/auth-helper';
import { tenantAiContextRef } from '@/lib/ai/memory/loader';
import { tenantAiContextSchema } from '@/lib/schemas/tenant-ai-context-schema';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  try {
    const snap = await tenantAiContextRef(auth.tenantId).get();
    return NextResponse.json({ context: snap.exists ? snap.data() : null });
  } catch (err) {
    console.error('GET /api/tenant/ai-context', err);
    return new NextResponse('lookup_failed', { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('ai-context-write', auth.uid), 20, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  let parsed;
  try {
    parsed = tenantAiContextSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  try {
    await tenantAiContextRef(auth.tenantId).set({
      ...parsed,
      updatedAt: Date.now(),
      updatedBy: auth.uid
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/tenant/ai-context', err);
    return new NextResponse('save_failed', { status: 500 });
  }
}
