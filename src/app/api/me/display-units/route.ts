/**
 * GET/PUT /api/me/display-units — the caller's preferred display units.
 *
 * Stored at users/{uid}/displayUnits/settings — personal and cross-tenant, the
 * same shape as aiPreferences: a unit preference belongs to the person reading
 * the screen, not to the lab they happen to be in.
 *
 * No feature gate. This is a rendering preference, not a feature: gating it
 * would leave someone able to see a band gap but not to choose whether it
 * reads in eV or Ry, which is not a billing boundary (ADR-042).
 *
 * Auth: any signed-in user, reading and writing only their own doc (uid comes
 * from the token, never from the body).
 *
 * @phase R523 — units of measure
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { DISPLAY_UNITS_DEFAULTS, displayUnitsSchema } from '@/lib/schemas/display-units-schema';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

function displayUnitsRef(uid: string) {
  return getAdminFirestoreService().doc(`users/${uid}/displayUnits/settings`);
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  try {
    const snap = await displayUnitsRef(auth.uid).get();
    const units = snap.exists ? snap.data() : DISPLAY_UNITS_DEFAULTS;
    return NextResponse.json({ units });
  } catch (err) {
    console.error('GET /api/me/display-units', err);
    return new NextResponse('lookup_failed', { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('display-units-write', auth.uid), 20, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  let parsed;
  try {
    parsed = displayUnitsSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  try {
    await displayUnitsRef(auth.uid).set({ ...parsed, updatedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/me/display-units', err);
    return new NextResponse('save_failed', { status: 500 });
  }
}
