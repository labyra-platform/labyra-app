/**
 * POST /api/cron/bm25-refit — Daily batch refit BM25 for all tenants.
 * @phase R160-ai-5d-2
 *
 * Triggered by Vercel Cron (configured in vercel.json).
 * Iterates all tenants, refits BM25 on current corpus.
 *
 * Auth: requires CRON_SECRET environment variable matching request header.
 */
// R165-phase-1-oxlint: oxlint cleanup

import { refitTenant } from '@/lib/ai/rag/sparse/bm25-manager';
import { getAdminFirestoreService } from '@/lib/firebase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — should fit < 10K docs total

export async function POST(request: Request) {
  // Auth check
  const auth = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401
    });
  }

  const startedAt = Date.now();
  const db = getAdminFirestoreService();
  const tenants = await db.collection('tenants').get();

  const results: Array<{ tenantId: string; success: boolean; error?: string }> = [];
  for (const t of tenants.docs) {
    const tenantId = t.id;
    try {
      const encoder = await refitTenant(tenantId);
      results.push({
        tenantId,
        success: encoder !== null
      });
    } catch (err) {
      results.push({
        tenantId,
        success: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const elapsed = Date.now() - startedAt;
  // eslint-disable-next-line no-console -- structured logging for audit
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'bm25_cron_complete',
      tenantsProcessed: results.length,
      successful: results.filter((r) => r.success).length,
      elapsedMs: elapsed
    })
  );

  return new Response(JSON.stringify({ ok: true, tenants: results.length, elapsedMs: elapsed }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

export async function GET(request: Request) {
  // Vercel Cron uses GET — accept both
  return POST(request);
}
