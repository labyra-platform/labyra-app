/**
 * GET /api/spectra/[id]/signed-download
 *
 * Returns: { url, expiresAt }
 *
 * Generates a short-lived signed URL for the raw file.
 *
 * @phase R160-spectra-1
 * R164 R164-phase-5b-2: moved from /api/spectra/* → /api/measurements/*.
 * R164 R164-phase-5b-1: backend now reads from measurements collection (URL unchanged).
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { getSignedDownloadUrl } from '@/lib/firebase/storage';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { SpectrumMetadata } from '@/types/spectra';

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

    // R162-read-tier — per-tenant read rate limit
    const rl = await checkRateLimit(rateLimitKey('signed-download', tenantId), 100, 60);
    if (!rl.allowed) {
      return new NextResponse('rate_limited', {
        status: 429,
        headers: { 'Retry-After': String(rl.resetSec) }
      });
    }

    const db = getAdminFirestoreService();
    const snap = await db.doc(`tenants/${tenantId}/measurements/${id}`).get();
    if (!snap.exists) {
      return new NextResponse('not_found', { status: 404 });
    }
    const data = snap.data() as SpectrumMetadata;
    // Extract path from gs:// URI
    const gsPath = data.storage.raw.replace(/^gs:\/\/[^/]+\//, '');

    const url = await getSignedDownloadUrl(gsPath);
    return NextResponse.json({ url, expiresAt: Date.now() + 15 * 60 * 1000 });
  } catch (err) {
    console.error('GET signed-download error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', {
      status: 500
    });
  }
}
