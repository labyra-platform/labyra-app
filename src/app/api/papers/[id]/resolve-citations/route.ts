/**
 * POST /api/papers/[id]/resolve-citations — batch re-resolve reference titles.
 *
 * Re-resolves citations of this paper that have a DOI but no title (the
 * "Untitled reference" rows) via OpenAlex batch lookup. Idempotent + safe to
 * re-run. @phase R177-2-doi-resolver
 */
import { resolveCitationsForPaper } from '@/lib/ai/citations/resolve-citations';
import { getRoleFromToken, getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'missing_token' }), { status: 401 });
  }

  let decoded;
  try {
    decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401 });
  }

  const tenantId = getTenantIdFromToken(decoded);
  const role = getRoleFromToken(decoded);
  if (role === 'viewer' || role === null) {
    return new Response(JSON.stringify({ error: 'forbidden_viewer' }), { status: 403 });
  }
  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'missing_tenant_claim' }), { status: 403 });
  }

  // Heavier op (external API fan-out) → per-user, modest budget.
  const rl = await checkRateLimit(
    rateLimitKey('resolve-citations', `${tenantId}:${decoded.uid}`),
    10,
    300
  );
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'Retry-After': String(rl.resetSec) }
    });
  }

  const { id: paperId } = await context.params;
  try {
    const result = await resolveCitationsForPaper(tenantId, paperId);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'resolve_citations_failed',
        paperId,
        error: err instanceof Error ? err.message : String(err)
      })
    );
    return new Response(JSON.stringify({ error: 'resolve_failed' }), { status: 500 });
  }
}
