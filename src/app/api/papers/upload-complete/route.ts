/**
 * POST /api/papers/upload-complete — Step 3 of 3-step signed-URL upload.
 *
 * Finalizes upload session: verifies file in Storage, computes paperId from
 * Storage md5Hash (dedup), moves file to final path, creates Firestore doc,
 * publishes Pub/Sub processing job.
 *
 * Body: { sessionId: string }
 * Response: { ok, paperId, version, duplicate }
 *
 * Idempotency: paperId = Storage md5Hash. Duplicate upload of same file →
 * same paperId → Firestore doc exists → cleanup temp + return existing.
 *
 * @phase R168-3.2
 */
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { trackUsage } from '@/lib/ai/governance/quota';
import { getJobQueue } from '@/lib/ai/rag/jobs';
import { getTenantIdFromToken, getRoleFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import {
  deleteFile,
  fileExists,
  getFileMetadata,
  movePaperFile,
  paperStoragePath
} from '@/lib/firebase/storage';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { Paper } from '@/types/papers';

export const runtime = 'nodejs';
export const maxDuration = 30;

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

interface UploadCompleteRequest {
  sessionId: string;
}

interface QuotaReservation {
  sessionId: string;
  userId: string;
  tenantId: string;
  sizeBytes: number;
  originalFilename: string;
  contentType: string;
  storagePath: string;
  expiresAt: { toMillis(): number };
}

export async function POST(request: Request) {
  // ─── Auth ─────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'missing_token');
  let decoded;
  try {
    decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return jsonError(401, 'invalid_token');
  }
  const tenantId = getTenantIdFromToken(decoded);
  const userId = decoded.uid;
  if (!tenantId) return jsonError(403, 'missing_tenant_claim');

  const rl = await checkRateLimit(rateLimitKey('paper-upload-complete', tenantId), 30, 60);
  if (!rl.allowed) return jsonError(429, 'rate_limited', { retryAfter: rl.resetSec });

  // ─── Parse body ───────────────────────────────────────────────
  let body: UploadCompleteRequest;
  try {
    body = (await request.json()) as UploadCompleteRequest;
  } catch {
    return jsonError(400, 'invalid_json');
  }
  if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) {
    return jsonError(400, 'sessionId_required');
  }

  const db = getAdminFirestoreService();

  // ─── Verify reservation ──────────────────────────────────────
  const resRef = db.doc(`tenants/${tenantId}/_quota_reservations/${body.sessionId}`);
  const resSnap = await resRef.get();
  if (!resSnap.exists) {
    return jsonError(404, 'session_not_found_or_expired');
  }
  const reservation = resSnap.data() as QuotaReservation;
  if (reservation.userId !== userId) {
    return jsonError(403, 'session_owner_mismatch');
  }
  if (reservation.expiresAt.toMillis() < Date.now()) {
    await resRef.delete();
    await deleteFile(reservation.storagePath).catch(() => undefined);
    return jsonError(410, 'session_expired');
  }

  // ─── Verify file in Storage + get metadata ───────────────────
  const tempPath = reservation.storagePath;
  if (!(await fileExists(tempPath))) {
    return jsonError(409, 'file_not_uploaded', {
      hint: 'PUT to signedUploadUrl first'
    });
  }

  let metadata;
  try {
    metadata = await getFileMetadata(tempPath);
  } catch (err) {
    return jsonError(500, 'metadata_fetch_failed', {
      detail: err instanceof Error ? err.message : 'unknown'
    });
  }

  // ─── Size match check ────────────────────────────────────────
  const actualSize =
    typeof metadata.size === 'string' ? parseInt(metadata.size, 10) : metadata.size;
  if (actualSize !== reservation.sizeBytes) {
    await deleteFile(tempPath).catch(() => undefined);
    await resRef.delete();
    return jsonError(422, 'size_mismatch', {
      declared: reservation.sizeBytes,
      actual: actualSize
    });
  }

  // ─── md5Hash → paperId (Firebase Storage auto-computes md5) ──
  // md5Hash is base64. Convert to hex for use as paperId.
  if (!metadata.md5Hash) {
    await deleteFile(tempPath).catch(() => undefined);
    await resRef.delete();
    return jsonError(500, 'no_md5_hash', {
      hint: 'Storage did not provide md5Hash; file may be corrupt'
    });
  }
  const md5Hex = Buffer.from(metadata.md5Hash, 'base64').toString('hex');
  const paperId = md5Hex; // 32-char hex string

  // ─── Idempotency dedup ───────────────────────────────────────
  const paperRef = db.doc(`tenants/${tenantId}/papers/${paperId}`);
  const existing = await paperRef.get();
  if (existing.exists) {
    // Already uploaded — cleanup temp + reservation
    await deleteFile(tempPath).catch(() => undefined);
    await resRef.delete();
    return new Response(JSON.stringify({ ok: true, paperId, version: 1, duplicate: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  // ─── Move file to final path ─────────────────────────────────
  const version = 1;
  const finalPath = paperStoragePath(tenantId, paperId, version);
  try {
    await movePaperFile(tempPath, finalPath);
  } catch (err) {
    return jsonError(500, 'storage_move_failed', {
      detail: err instanceof Error ? err.message : 'unknown'
    });
  }

  // ─── Create Firestore paper doc ──────────────────────────────
  const now = Date.now();
  const paper: Paper = {
    schemaVersion: 2,
    currentVersion: version,
    createdBy: userId,
    createdAt: now,
    lifecycleStatus: 'active',
    id: paperId,
    tenantId,
    version,
    source: 'upload',
    storagePath: finalPath,
    contentHash: paperId, // = md5Hex (Stage 1 — async sha256 verify R169+)
    fileSize: actualSize,
    uploadedBy: userId,
    uploadedAt: now,
    title: reservation.originalFilename.replace(/\.pdf$/i, ''),
    authors: [],
    year: 0,
    doi: '',
    abstract: '',
    // R177-1e: book detection defaults (worker overwrites after OCR)
    documentType: 'unknown',
    isbn: '',
    publisher: '',
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

  // ─── Track usage + release reservation ───────────────────────
  await trackUsage(tenantId, 'paper', 1);
  await trackUsage(tenantId, 'storage', actualSize);
  await resRef.delete();

  // ─── Enqueue processing ──────────────────────────────────────
  const jobId = randomUUID();
  try {
    await (
      await getJobQueue()
    ).enqueue({
      jobId,
      paperId,
      tenantId,
      version,
      storagePath: finalPath,
      createdBy: userId,
      enqueuedAt: now
    });
  } catch (err) {
    // Paper is in Firestore — pipeline can be re-triggered via /reprocess.
    // eslint-disable-next-line no-console -- structured audit log
    console.error(
      JSON.stringify({
        level: 'warn',
        event: 'pubsub_enqueue_failed_at_upload_complete',
        paperId,
        tenantId,
        error: err instanceof Error ? err.message : String(err)
      })
    );
  }

  return new Response(JSON.stringify({ ok: true, paperId, version, duplicate: false }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}
