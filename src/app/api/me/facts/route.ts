/**
 * GET/DELETE /api/me/facts — user's own remembered facts (ADR-035 M2, L2).
 *
 * GET: list current (non-superseded) facts for the caller, in their tenant.
 * DELETE ?id=...: delete one fact (trust/GDPR — user controls their memory).
 *
 * Facts live under tenants/{tid}/userMemories/{uid}; tenantId + uid from token.
 *
 * @phase R193-mem-m2
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { deleteFact, loadCurrentFacts } from '@/lib/ai/memory/fact-store';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  try {
    const facts = await loadCurrentFacts(auth.tenantId, auth.uid, 200);
    // Strip nothing sensitive — these are the user's own facts; expose source.
    const items = facts.map((f) => ({
      id: f.id,
      subject: f.subject,
      object: f.object,
      confidence: f.confidence,
      sourceQuote: f.sourceQuote,
      extractedAt: f.extractedAt,
      verifiedAt: f.verifiedAt
    }));
    return NextResponse.json({ facts: items });
  } catch (err) {
    console.error('GET /api/me/facts', err);
    return new NextResponse('lookup_failed', { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  const rl = await checkRateLimit(rateLimitKey('fact-delete', auth.uid), 60, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  try {
    await deleteFact(auth.tenantId, auth.uid, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('DELETE /api/me/facts', err);
    return new NextResponse('delete_failed', { status: 500 });
  }
}
