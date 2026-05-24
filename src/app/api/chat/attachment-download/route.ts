/**
 * POST /api/chat/attachment-download — signed download URL cho ảnh đính kèm chat.
 *
 * Dùng khi reload conversation: message lưu storagePath, client cần URL xem ảnh.
 * Verify path thuộc tenant (chống cross-tenant traversal, như C3 paper).
 *
 * Body: { storagePath: string }
 * Response: { url, expiresAt }
 *
 * @phase R200 / ADR-036
 */
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { getSignedDownloadUrl } from '@/lib/firebase/storage';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
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

  const rl = await checkRateLimit(rateLimitKey('chat-attachment-dl', tenantId), 100, 60);
  if (!rl.allowed) return jsonError(429, 'rate_limited');

  let body: { storagePath?: string };
  try {
    body = (await request.json()) as { storagePath?: string };
  } catch {
    return jsonError(400, 'invalid_json');
  }
  const storagePath = body.storagePath;
  if (typeof storagePath !== 'string' || !storagePath) {
    return jsonError(400, 'storagePath_required');
  }
  // C3: tenant-prefix guard — prevent cross-tenant path traversal
  if (!storagePath.startsWith(`tenants/${tenantId}/chat-attachments/`)) {
    return jsonError(403, 'forbidden_path');
  }

  try {
    const url = await getSignedDownloadUrl(storagePath);
    return new Response(JSON.stringify({ url, expiresAt: Date.now() + 15 * 60 * 1000 }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'error');
  }
}
