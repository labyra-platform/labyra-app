/**
 * POST /api/papers/[id]/reprocess — Increment version, re-enqueue processing.
 * @phase R160-ai-5b-2
 */
import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getJobQueue } from '@/lib/ai/rag/jobs';
import { getVectorStore } from '@/lib/ai/rag/vector-store';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import { type Paper, TERMINAL_STATUSES } from '@/types/papers';

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
  const rl = await checkRateLimit(rateLimitKey('paper-reprocess', tenantId), 30, 60);
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
  if (!TERMINAL_STATUSES.has(paper.status)) {
    return new Response(
      JSON.stringify({
        error: 'not_terminal',
        currentStatus: paper.status,
        hint: 'cancel first then reprocess'
      }),
      { status: 409 }
    );
  }

  // Clean up old chunks (Pinecone + Firestore)
  try {
    await getVectorStore().deleteByPaperId(tenantId, paperId);
  } catch (err) {
    // 404 is expected when namespace empty / first reprocess — silence
    const errName = (err as { name?: string }).name;
    if (errName !== 'PineconeNotFoundError') {
      console.error(
        JSON.stringify({
          level: 'warn',
          event: 'reprocess_pinecone_cleanup_failed',
          paperId,
          error: err instanceof Error ? err.message : String(err)
        })
      );
    }
  }

  const chunksSnap = await db.collection(`tenants/${tenantId}/papers/${paperId}/chunks`).get();
  const batch = db.batch();
  chunksSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  // Reset paper state, bump version
  const now = Timestamp.now();
  await ref.update({
    status: 'queued',
    version: FieldValue.increment(1),
    statusUpdatedAt: now,
    error: '',
    cancelRequestedAt: 0,
    retryCount: 0,
    chunkCount: 0,
    enrichedChunkCount: 0,
    embeddedChunkCount: 0,
    indexedChunkCount: 0,
    costUsd: { ocr: 0, enrichment: 0, embedding: 0, total: 0 },
    processingStartedAt: 0,
    processingCompletedAt: 0,
    totalLatencyMs: 0
  });

  // Re-enqueue
  const jobId = randomUUID();
  await (
    await getJobQueue()
  ).enqueue({
    jobId,
    paperId,
    tenantId,
    version: paper.version + 1,
    storagePath: paper.storagePath,
    createdBy: paper.createdBy ?? paper.uploadedBy,
    enqueuedAt: Date.now()
  });

  return new Response(JSON.stringify({ ok: true, version: paper.version + 1 }), {
    status: 202,
    headers: { 'content-type': 'application/json' }
  });
}
