/**
 * GET /api/papers/[id]/signed-download
 *
 * Returns: { url, expiresAt }
 *
 * Generates a 15-minute signed URL for the paper's PDF. Used by R178-1b
 * PDF viewer component. Foundation for R179 translate feature.
 *
 * Auth: Bearer Firebase ID token (tenant from custom claim).
 * Rate limit: 100 req/60s per tenant.
 *
 * @phase R178-1a
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { paperReadAllowed } from '@/lib/firebase/papers/access-guard';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { getSignedDownloadUrl } from '@/lib/firebase/storage';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { Paper } from '@/types/papers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new NextResponse('unauthorized', { status: 401 });
    }
    const decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
    const tenantId = getTenantIdFromToken(decoded);
    if (!tenantId) {
      return new NextResponse('no_tenant', { status: 403 });
    }

    // Per-tenant read rate limit (R162 pattern)
    const rl = await checkRateLimit(rateLimitKey('paper-signed-download', tenantId), 100, 60);
    if (!rl.allowed) {
      return new NextResponse('rate_limited', {
        status: 429,
        headers: { 'Retry-After': String(rl.resetSec) }
      });
    }

    const db = getAdminFirestoreService();
    const snap = await db.doc(`tenants/${tenantId}/papers/${id}`).get();
    if (!snap.exists) {
      return new NextResponse('not_found', { status: 404 });
    }
    const data = snap.data() as Paper;

    // R498: ADR-034 group read-scope — foreign-group callers get 404.
    if (!paperReadAllowed(decoded, data)) {
      return new NextResponse('not_found', { status: 404 });
    }

    // Lifecycle check: retracted papers can't be downloaded
    // (defense in depth — UI should hide button but API enforces)
    if (data.lifecycleStatus === 'retracted') {
      return new NextResponse('retracted', { status: 410 });
    }

    // storagePath is direct GCS path (no gs:// prefix per R167 pattern)
    // C3: tenant-prefix guard — prevent cross-tenant path traversal
    const expectedPrefix = `tenants/${tenantId}/papers/`;
    if (!data.storagePath.startsWith(expectedPrefix)) {
      console.error('C3 paper signed-download prefix mismatch', {
        tenantId,
        storagePath: data.storagePath
      });
      return new NextResponse('forbidden_path', { status: 403 });
    }

    const url = await getSignedDownloadUrl(data.storagePath);
    return NextResponse.json(
      { url, expiresAt: Date.now() + 15 * 60 * 1000 },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('GET paper signed-download error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', {
      status: 500
    });
  }
}
