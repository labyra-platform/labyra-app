/**
 * GET /api/chemicals/lookup?cas=7732-18-5 — PubChem auto-fill.
 *
 * Authed (any tenant member). Caches results in _pubchem_cache/{cas}
 * (90-day TTL) to avoid hammering PubChem on repeat lookups.
 *
 * @phase CHEM-2
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { lookupCas } from '@/lib/chemicals/pubchem';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CAS_RE = /^\d{2,7}-\d{2}-\d$/;

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const cas = req.nextUrl.searchParams.get('cas')?.trim() ?? '';
  if (!CAS_RE.test(cas)) {
    return NextResponse.json({ error: 'invalid_cas' }, { status: 400 });
  }

  // Per-user rate limit — external API politeness.
  const rl = await checkRateLimit(
    rateLimitKey('chem-lookup', `${auth.tenantId}:${auth.uid}`),
    20,
    60
  );
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  const db = getAdminFirestoreService();
  const cacheKey = cas.replace(/[^0-9-]/g, '');
  const cacheRef = db.doc(`_pubchem_cache/${cacheKey}`);

  // Cache hit?
  try {
    const cached = await cacheRef.get();
    if (cached.exists) {
      const data = cached.data() as { result: unknown; fetchedAt: number };
      if (Date.now() - data.fetchedAt < CACHE_TTL_MS) {
        return NextResponse.json({ result: data.result, cached: true });
      }
    }
  } catch {
    // Cache read failure is non-fatal — proceed to live lookup.
  }

  const result = await lookupCas(cas);
  if (!result) {
    return NextResponse.json({ result: null, notFound: true });
  }

  // Best-effort cache write.
  try {
    await cacheRef.set({ result, fetchedAt: Date.now() });
  } catch {
    // ignore
  }

  return NextResponse.json({ result, cached: false });
}
