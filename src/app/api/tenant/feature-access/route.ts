/**
 * GET/PUT /api/tenant/feature-access — per-tenant feature gating (R487).
 *
 * Stored at tenants/{tid}/featureAccess/main as { disabled: string[] }.
 * Read: any tenant member (the sidebar needs it). Write: admin/superadmin.
 * Keys are validated against the nav-config whitelist so a typo can never
 * silently gate nothing (or everything). Admins are never affected by the
 * gate itself — enforcement lives client-side in use-nav + the route guard.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { allFeatureKeys } from '@/config/nav-config';
import { authenticate, authenticateAdmin } from '@/lib/api/auth-helper';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

function featureAccessRef(tenantId: string) {
  return getAdminFirestoreService().doc(`tenants/${tenantId}/featureAccess/main`);
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  try {
    const snap = await featureAccessRef(auth.tenantId).get();
    const disabled = snap.exists ? ((snap.data()?.disabled as string[] | undefined) ?? []) : [];
    return NextResponse.json({ disabled });
  } catch (err) {
    console.error('GET /api/tenant/feature-access', err);
    return new NextResponse('lookup_failed', { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('feature-access-write', auth.uid), 20, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  const valid = new Set(allFeatureKeys());
  const schema = z.object({
    disabled: z.array(z.string().refine((k) => valid.has(k))).max(valid.size)
  });

  let parsed;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  try {
    await featureAccessRef(auth.tenantId).set({
      disabled: [...new Set(parsed.disabled)],
      updatedAt: Date.now(),
      updatedBy: auth.uid
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/tenant/feature-access', err);
    return new NextResponse('save_failed', { status: 500 });
  }
}
