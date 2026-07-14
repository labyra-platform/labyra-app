/**
 * GET/PUT /api/tenant/feature-access — per-tenant + per-group feature gating
 * (R487, R491).
 *
 * Stored at tenants/{tid}/featureAccess/main as
 *   { disabled: string[], groups?: Record<groupId, string[]> }.
 * A group with an entry in `groups` uses it as a FULL OVERRIDE of the default;
 * groups without one (and group-less users) use `disabled`.
 *
 * GET: any member — returns { disabled } RESOLVED for the caller's group, so
 *   the sidebar/guard never change. Admins may pass ?full=true to receive
 *   { disabled, groups, groupList } for the settings form.
 * PUT: admin — body { disabled, groupId? , reset? }. No groupId → default;
 *   groupId → that group's override; reset:true → drop the override.
 * Keys are whitelist-validated. Admins are never gated (client-side rule).
 */
import { FieldValue } from 'firebase-admin/firestore';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { allFeatureKeys } from '@/config/nav-config';
import { authenticate, authenticateAdmin } from '@/lib/api/auth-helper';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { getGroup, listGroups } from '@/lib/firebase/groups/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

function featureAccessRef(tenantId: string) {
  return getAdminFirestoreService().doc(`tenants/${tenantId}/featureAccess/main`);
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const full = req.nextUrl.searchParams.get('full') === 'true';
  const isAdmin = auth.role === 'admin' || auth.role === 'superadmin';
  try {
    const snap = await featureAccessRef(auth.tenantId).get();
    const data = snap.exists ? snap.data() : undefined;
    const disabled = (data?.disabled as string[] | undefined) ?? [];
    const groups = (data?.groups as Record<string, string[]> | undefined) ?? {};

    if (full && isAdmin) {
      const groupList = (await listGroups(auth.tenantId)).map((g) => ({ id: g.id, name: g.name }));
      return NextResponse.json({ disabled, groups, groupList });
    }

    // R491: resolve for the caller — group override wins, else tenant default.
    const resolved = auth.groupId && groups[auth.groupId] ? groups[auth.groupId] : disabled;
    return NextResponse.json({ disabled: resolved });
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
    disabled: z
      .array(z.string().refine((k) => valid.has(k)))
      .max(valid.size)
      .default([]),
    groupId: z.string().min(1).optional(),
    reset: z.boolean().optional()
  });

  let parsed;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  try {
    if (parsed.groupId) {
      const group = await getGroup(auth.tenantId, parsed.groupId);
      if (!group) return NextResponse.json({ error: 'unknown_group' }, { status: 400 });
      const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: auth.uid };
      patch[`groups.${parsed.groupId}`] = parsed.reset
        ? FieldValue.delete()
        : [...new Set(parsed.disabled)];
      // set+merge cannot express map-key delete; ensure doc exists then update.
      const ref = featureAccessRef(auth.tenantId);
      if (!(await ref.get()).exists) {
        await ref.set({ disabled: [], updatedAt: Date.now(), updatedBy: auth.uid });
      }
      await ref.update(patch);
    } else {
      await featureAccessRef(auth.tenantId).set(
        {
          disabled: [...new Set(parsed.disabled)],
          updatedAt: Date.now(),
          updatedBy: auth.uid
        },
        { merge: true }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/tenant/feature-access', err);
    return new NextResponse('save_failed', { status: 500 });
  }
}
