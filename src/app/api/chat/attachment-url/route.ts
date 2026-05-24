/**
 * POST /api/chat/attachment-url — signed URL cho ảnh đính kèm chat (ADR-036).
 *
 * Client xin signed URL -> PUT ảnh trực tiếp lên Storage -> gửi storagePath
 * kèm message. Bypass giới hạn body 4.5MB của Vercel function.
 *
 * Body: { conversationId: string, contentType: string, sizeBytes: number, name: string }
 * Response: { attachmentId, signedUploadUrl, storagePath, expiresAt }
 *
 * Chỉ ảnh (phase 2a): PNG/JPEG/WebP/GIF, <= 5MB.
 *
 * @phase R200 / ADR-036
 */
import { randomUUID } from 'node:crypto';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { chatAttachmentPath, getSignedUploadUrl } from '@/lib/firebase/storage';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 10;

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

interface AttachmentUrlRequest {
  conversationId: string;
  contentType: string;
  sizeBytes: number;
  name: string;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'missing_token');
  let decoded;
  try {
    decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return jsonError(401, 'invalid_token');
  }
  const tenantId = getTenantIdFromToken(decoded);
  if (!tenantId) return jsonError(403, 'missing_tenant_claim');

  const rl = await checkRateLimit(rateLimitKey('chat-attachment-url', tenantId), 30, 300);
  if (!rl.allowed) return jsonError(429, 'rate_limited', { retryAfter: rl.resetSec });

  let body: AttachmentUrlRequest;
  try {
    body = (await request.json()) as AttachmentUrlRequest;
  } catch {
    return jsonError(400, 'invalid_json');
  }
  if (typeof body.conversationId !== 'string' || !body.conversationId) {
    return jsonError(400, 'conversationId_required');
  }
  if (typeof body.sizeBytes !== 'number' || body.sizeBytes <= 0) {
    return jsonError(400, 'sizeBytes_required');
  }
  if (body.sizeBytes > MAX_IMAGE_SIZE) {
    return jsonError(413, 'file_too_large', { maxBytes: MAX_IMAGE_SIZE });
  }
  if (!ALLOWED_TYPES.has(body.contentType)) {
    return jsonError(415, 'image_only', { allowed: [...ALLOWED_TYPES] });
  }

  const ext = body.contentType.split('/')[1] === 'jpeg' ? 'jpg' : body.contentType.split('/')[1];
  const attachmentId = randomUUID();
  const storagePath = chatAttachmentPath(tenantId, body.conversationId, attachmentId, ext);
  const expiresAt = Date.now() + SIGNED_URL_TTL_MS;

  let signedUploadUrl: string;
  try {
    signedUploadUrl = await getSignedUploadUrl(storagePath, body.contentType, SIGNED_URL_TTL_MS);
  } catch (err) {
    return jsonError(500, 'signed_url_failed', {
      detail: err instanceof Error ? err.message : 'unknown'
    });
  }

  return new Response(JSON.stringify({ attachmentId, signedUploadUrl, storagePath, expiresAt }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}
