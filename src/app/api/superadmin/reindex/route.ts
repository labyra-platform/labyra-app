/**
 * POST /api/superadmin/reindex — re-enqueue every indexed paper for a tenant.
 *
 * Batch version of /api/papers/[id]/reprocess: deletes each paper's old chunks
 * (Pinecone + Firestore), resets state + bumps version, and re-enqueues the
 * processing job. Used to re-index the whole library after toggling
 * ENABLE_ENRICHMENT so the Contextual Retrieval A/B has an enriched corpus.
 *
 * ORDER MATTERS: set ENABLE_ENRICHMENT=true and redeploy the worker BEFORE
 * calling this, so the re-enqueued jobs are processed with enrichment on.
 *
 * Body: { tenantId: string }
 * Returns { ok, total, enqueued, failed }. Processing is async (worker chews
 * through the jobs over minutes); poll paper status until all are 'indexed'.
 *
 * @phase R248
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getJobQueue } from '@/lib/ai/rag/jobs';
import { getVectorStore } from '@/lib/ai/rag/vector-store';
import { requireSuperadmin } from '@/lib/auth/superadmin-guard';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { mapWithConcurrency } from '@/lib/utils/concurrency';
import type { Paper } from '@/types/papers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const REINDEX_CONCURRENCY = 5;

interface ReindexOutcome {
  id: string;
  ok: boolean;
  error?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireSuperadmin(request);
  if (!guard.allowed) return guard.response!;

  let body: { tenantId?: string };
  try {
    body = (await request.json()) as { tenantId?: string };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const tenantId = (body.tenantId ?? '').trim();
  if (!tenantId) return NextResponse.json({ error: 'tenantId_required' }, { status: 400 });

  const db = getAdminFirestoreService();
  const snap = await db
    .collection(`tenants/${tenantId}/papers`)
    .where('status', '==', 'indexed')
    .get();
  const papers = snap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() as Paper }));
  if (papers.length === 0) {
    return NextResponse.json({ ok: true, total: 0, enqueued: 0, hint: 'no indexed papers' });
  }

  const queue = await getJobQueue();
  const vectorStore = getVectorStore();

  const results = await mapWithConcurrency<(typeof papers)[number], ReindexOutcome>(
    papers,
    REINDEX_CONCURRENCY,
    async (p) => {
      try {
        // Drop old chunks so the worker re-creates enriched ones cleanly.
        try {
          await vectorStore.deleteByPaperId(tenantId, p.id);
        } catch (err) {
          if ((err as { name?: string }).name !== 'PineconeNotFoundError') throw err;
        }
        const chunksSnap = await db.collection(`tenants/${tenantId}/papers/${p.id}/chunks`).get();
        if (!chunksSnap.empty) {
          const batch = db.batch();
          chunksSnap.docs.forEach((c) => batch.delete(c.ref));
          await batch.commit();
        }

        // Reset state + bump version (mirrors single-paper reprocess route).
        await p.ref.update({
          status: 'queued',
          version: FieldValue.increment(1),
          statusUpdatedAt: Timestamp.now(),
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

        await queue.enqueue({
          jobId: randomUUID(),
          paperId: p.id,
          tenantId,
          version: (p.data.version ?? 0) + 1,
          storagePath: p.data.storagePath,
          createdBy: p.data.createdBy ?? p.data.uploadedBy,
          enqueuedAt: Date.now()
        });
        return { id: p.id, ok: true };
      } catch (err) {
        return { id: p.id, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    ok: true,
    total: papers.length,
    enqueued: results.length - failed.length,
    failed
  });
}
