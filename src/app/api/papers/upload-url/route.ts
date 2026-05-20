/**
 * POST /api/papers/upload-url — Step 1 of 3-step signed-URL upload flow.
 *
 * Generates a Firebase Storage signed URL for direct client-to-Storage PUT,
 * bypassing the Vercel function 4.5MB body limit. Reserves quota for 1h.
 *
 * Flow:
 *   Step 1 (this): client requests signed URL with size + content-type.
 *   Step 2: client PUTs bytes directly to Storage signed URL.
 *   Step 3: client calls /api/papers/upload-complete to finalize.
 *
 * Body: { sizeBytes: number, contentType: 'application/pdf', originalFilename: string }
 * Response: { sessionId, signedUploadUrl, storagePath, expiresAt }
 *
 * @phase R168-3.2
 * @see docs/round-r167-handoff.md §3.2
 */
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { checkQuota } from '@/lib/ai/governance/quota';
import { getTenantIdFromToken, getRoleFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { getSignedUploadUrl } from '@/lib/firebase/storage';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 10; // Quick — no big body

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const RESERVATION_TTL_MS = 60 * 60 * 1000; // 1h
const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15min

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

interface UploadUrlRequest {
  sizeBytes: number;
  contentType: string;
  originalFilename: string;
}

export async function POST(request: Request) {
  // ─── Auth ─────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError(401, 'missing_token');
  }
  let decoded;
  try {
    decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return jsonError(401, 'invalid_token');
  }
  const tenantId = getTenantIdFromToken(decoded);
  const userId = decoded.uid;
  if (!tenantId) return jsonError(403, 'missing_tenant_claim');

  // ─── Rate limit (stricter than regular upload — signed URL spam protection) ───
  const rl = await checkRateLimit(rateLimitKey('paper-upload-url', tenantId), 10, 300);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { retryAfter: rl.resetSec });
  }

  // ─── Parse + validate body ────────────────────────────────────
  let body: UploadUrlRequest;
  try {
    body = (await request.json()) as UploadUrlRequest;
  } catch {
    return jsonError(400, 'invalid_json');
  }
  if (typeof body.sizeBytes !== 'number' || body.sizeBytes <= 0) {
    return jsonError(400, 'sizeBytes_required');
  }
  if (body.sizeBytes > MAX_FILE_SIZE) {
    return jsonError(413, 'file_too_large', { maxBytes: MAX_FILE_SIZE });
  }
  if (body.contentType !== 'application/pdf') {
    return jsonError(415, 'pdf_only');
  }
  if (typeof body.originalFilename !== 'string' || body.originalFilename.length === 0) {
    return jsonError(400, 'filename_required');
  }

  // ─── Quota check (paper count + storage size) ────────────────
  const papersQuota = await checkQuota(tenantId, 'paper', 1);
  if (!papersQuota.allowed) {
    return jsonError(429, papersQuota.reason ?? 'quota_exceeded', {
      action: 'paper',
      current: papersQuota.current,
      limit: papersQuota.limit
    });
  }
  const storageQuota = await checkQuota(tenantId, 'storage', body.sizeBytes);
  if (!storageQuota.allowed) {
    return jsonError(429, storageQuota.reason ?? 'storage_quota_exceeded', {
      action: 'storage',
      current: storageQuota.current,
      limit: storageQuota.limit
    });
  }

  // ─── Generate session + temp storage path ────────────────────
  const sessionId = randomUUID();
  const storagePath = `papers/${tenantId}/_uploads/${sessionId}.pdf`;
  const expiresAt = Date.now() + SIGNED_URL_TTL_MS;

  // ─── Generate signed URL ─────────────────────────────────────
  let signedUploadUrl: string;
  try {
    signedUploadUrl = await getSignedUploadUrl(storagePath, body.contentType, SIGNED_URL_TTL_MS);
  } catch (err) {
    return jsonError(500, 'signed_url_failed', {
      detail: err instanceof Error ? err.message : 'unknown'
    });
  }

  // ─── Persist reservation (allows Step 3 to verify legitimacy) ────
  const db = getAdminFirestoreService();
  await db.doc(`tenants/${tenantId}/_quota_reservations/${sessionId}`).set({
    sessionId,
    userId,
    tenantId,
    action: 'paper',
    sizeBytes: body.sizeBytes,
    originalFilename: body.originalFilename,
    contentType: body.contentType,
    storagePath,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + RESERVATION_TTL_MS)
  });

  return new Response(
    JSON.stringify({
      sessionId,
      signedUploadUrl,
      storagePath,
      expiresAt
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }
  );
}
