/**
 * POST /api/papers/[id]/cancel — Request cancellation of running job.
 * @phase R160-ai-5b-2
 */
import { Timestamp } from 'firebase-admin/firestore';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import { CANCELLABLE_STATUSES, type Paper } from '@/types/papers';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'missing_token' }), {
      status: 401
    });
  }
  const idToken = authHeader.slice('Bearer '.length);

  let decoded;
  try {
    decoded = await getAdminAuthService().verifyIdToken(idToken);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 401
    });
  }

  const tenantId = getTenantIdFromToken(decoded);
  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'missing_tenant_claim' }), {
      status: 403
    });
  }

  // R162-tier-rate-limit — per-tenant rate limit
  const rl = await checkRateLimit(rateLimitKey('paper-cancel', tenantId), 30, 60);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'Retry-After': String(rl.resetSec)
      }
    });
  }

  const { id: paperId } = await context.params;
  const db = getAdminFirestoreService();
  const ref = db.doc(`tenants/${tenantId}/papers/${paperId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return new Response(JSON.stringify({ error: 'paper_not_found' }), {
      status: 404
    });
  }

  const paper = snap.data() as Paper;
  if (!CANCELLABLE_STATUSES.has(paper.status)) {
    return new Response(
      JSON.stringify({
        error: 'not_cancellable',
        currentStatus: paper.status
      }),
      { status: 409 }
    );
  }

  // @r180-applied: R180-1 set status='cancelled' directly (terminal).
  // No longer wait for worker ack — worker reads status at next step and stops.
  // Fixes stuck 'cancelling' when worker scales to zero.
  await ref.update({
    status: 'cancelled',
    cancelRequestedAt: Timestamp.now(),
    cancelledAt: Timestamp.now(),
    statusUpdatedAt: Timestamp.now()
  });

  // Signal active job (best-effort — may have completed)
  // In Stage 1 InProcessQueue, jobId is not persisted. We rely on signal.aborted
  // check inside orchestrator, but Stage 1 doesn't track jobIds.
  // Future Stage 2: persist jobId on paper doc for targeted cancel.
  // For now: orchestrator polls cancel state via Firestore? Not implemented yet.
  // Simpler: trigger via in-process Map by iterating active jobs of this paperId.
  // Not exposed via JobQueue interface — manual cancel via Firestore flag only.
  // Orchestrator will see updated status on next pollable step.

  return new Response(JSON.stringify({ ok: true, status: 'cancelled' }), {
    status: 202,
    headers: { 'content-type': 'application/json' }
  });
}
