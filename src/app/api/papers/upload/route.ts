/**
 * POST /api/papers/upload — Upload PDF, dedup, store, enqueue processing.
 *
 * Flow:
 *   1. Verify Bearer token → tenantId, userId
 *   2. Parse multipart, get file (PDF, ≤ 50MB)
 *   3. Compute SHA-256 of bytes → paperId
 *   4. Idempotency check: if paper exists → return paperId (no reprocess)
 *   5. Quota check (papers, storage)
 *   6. Upload to Firebase Storage
 *   7. Create Firestore paper doc (status=queued)
 *   8. Track usage (paper count +1, storage +size)
 *   9. Enqueue processing job
 *   10. Return { paperId, duplicate }
 *
 * @phase R160-ai-5b-1
 */
import { createHash, randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { paperStoragePath, uploadBuffer } from '@/lib/firebase/storage';
import { checkQuota, trackUsage } from '@/lib/ai/governance/quota';
import { getJobQueue } from '@/lib/ai/rag/jobs';
import type { Paper } from '@/types/papers';
import { getTenantIdFromToken } from '@/lib/auth/token';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel: 60s for upload (processing is async)

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export async function POST(request: Request) {
  // ─── Auth ─────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError(401, 'missing_token');
  }
  const idToken = authHeader.slice('Bearer '.length);

  let decoded;
  try {
    decoded = await getAdminAuthService().verifyIdToken(idToken);
  } catch {
    return jsonError(401, 'invalid_token');
  }

  const tenantId = getTenantIdFromToken(decoded);
  const userId = decoded.uid;
  if (!tenantId) {
    return jsonError(403, 'missing_tenant_claim');
  }

  // ─── Parse multipart ──────────────────────────────────────────
  let file: File;
  try {
    const form = await request.formData();
    const fileEntry = form.get('file');
    if (!(fileEntry instanceof File)) {
      return jsonError(400, 'file_required');
    }
    file = fileEntry;
  } catch {
    return jsonError(400, 'invalid_multipart');
  }

  if (file.size === 0) return jsonError(400, 'empty_file');
  if (file.size > MAX_FILE_SIZE) return jsonError(413, 'file_too_large');
  if (file.type !== 'application/pdf') return jsonError(415, 'pdf_only');

  // ─── Compute content hash ────────────────────────────────────
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const paperId = contentHash;

  const db = getAdminFirestoreService();
  const paperRef = db.doc(`tenants/${tenantId}/papers/${paperId}`);

  // ─── Idempotency check ───────────────────────────────────────
  const existing = await paperRef.get();
  if (existing.exists) {
    return new Response(JSON.stringify({ paperId, duplicate: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  // ─── Quota check ─────────────────────────────────────────────
  const papersQuota = await checkQuota(tenantId, 'paper', 1);
  if (!papersQuota.allowed) {
    return jsonError(429, papersQuota.reason ?? 'quota_exceeded', {
      action: 'paper',
      current: papersQuota.current,
      limit: papersQuota.limit
    });
  }

  const storageQuota = await checkQuota(tenantId, 'storage', file.size);
  if (!storageQuota.allowed) {
    return jsonError(429, storageQuota.reason ?? 'storage_quota_exceeded', {
      action: 'storage',
      current: storageQuota.current,
      limit: storageQuota.limit
    });
  }

  // ─── Upload to Storage ───────────────────────────────────────
  const version = 1;
  const storagePath = paperStoragePath(tenantId, paperId, version);
  try {
    await uploadBuffer(storagePath, buffer, 'application/pdf');
  } catch (err) {
    return jsonError(500, 'storage_upload_failed', {
      detail: err instanceof Error ? err.message : 'unknown'
    });
  }

  // ─── Create Firestore doc ────────────────────────────────────
  const now = Date.now();
  const paper: Paper = {
    schemaVersion: 1,
    id: paperId,
    tenantId,
    version,
    source: 'upload',
    storagePath,
    contentHash,
    fileSize: file.size,
    uploadedBy: userId,
    uploadedAt: now,
    title: file.name.replace(/\.pdf$/i, ''),
    authors: [],
    year: 0,
    doi: '',
    abstract: '',
    pageCount: 0,
    status: 'queued',
    statusUpdatedAt: now,
    error: '',
    cancelRequestedAt: 0,
    retryCount: 0,
    maxRetries: 3,
    chunkCount: 0,
    enrichedChunkCount: 0,
    embeddedChunkCount: 0,
    indexedChunkCount: 0,
    costUsd: { ocr: 0, enrichment: 0, embedding: 0, total: 0 },
    processingStartedAt: 0,
    processingCompletedAt: 0,
    totalLatencyMs: 0
  };

  await paperRef.set({
    ...paper,
    uploadedAt: Timestamp.fromMillis(now),
    statusUpdatedAt: Timestamp.fromMillis(now)
  });

  // ─── Track usage ─────────────────────────────────────────────
  await trackUsage(tenantId, 'paper', 1);
  await trackUsage(tenantId, 'storage', file.size);

  // ─── Enqueue processing ──────────────────────────────────────
  // Note: processor not registered in ai-5b-1 yet (ai-5b-2 task).
  // For now, paper sits in 'queued' status. Status update tested via UI realtime listener.
  const jobId = randomUUID();
  try {
    await (
      await getJobQueue()
    ).enqueue({
      jobId,
      paperId,
      tenantId,
      version,
      enqueuedAt: now
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'warn',
        event: 'enqueue_failed_no_processor',
        message: err instanceof Error ? err.message : String(err),
        paperId
      })
    );
    // Don't fail upload — paper saved, can be reprocessed manually in ai-5b-2
  }

  // ─── Response ────────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      paperId,
      duplicate: false,
      ...(papersQuota.warning ? { quotaWarning: 'approaching_papers_limit' } : {})
    }),
    { status: 201, headers: { 'content-type': 'application/json' } }
  );
}
