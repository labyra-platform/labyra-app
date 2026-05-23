/**
 * GET/PUT /api/me/ai-preferences — current user's AI preferences (ADR-035 L3).
 *
 * Stored at TOP-LEVEL users/{uid}/aiPreferences/settings (personal, cross-tenant).
 * Auth: any signed-in user; reads/writes only their OWN doc (uid from token).
 *
 * @phase R192-mem-m1b
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { aiPreferencesRef } from '@/lib/ai/memory/loader';
import { AI_PREFERENCES_DEFAULTS, aiPreferencesSchema } from '@/lib/schemas/ai-preferences-schema';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  try {
    const snap = await aiPreferencesRef(auth.uid).get();
    const prefs = snap.exists ? snap.data() : AI_PREFERENCES_DEFAULTS;
    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    console.error('GET /api/me/ai-preferences', err);
    return new NextResponse('lookup_failed', { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('ai-prefs-write', auth.uid), 20, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  let parsed;
  try {
    parsed = aiPreferencesSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  try {
    await aiPreferencesRef(auth.uid).set({ ...parsed, updatedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/me/ai-preferences', err);
    return new NextResponse('save_failed', { status: 500 });
  }
}
