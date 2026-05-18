/**
 * GET /api/spectra/[id]/analysis
 * Returns the latest AnalysisResult for a spectrum.
 * @phase R160-spectra-3b
 * R164 R164-phase-5b-2: moved from /api/spectra/* → /api/measurements/*.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { getLatestAnalysis } from '@/lib/firestore/queries/spectra-analysis';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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
    const rl = await checkRateLimit(rateLimitKey('spectra-read', tenantId), 100, 60);
    if (!rl.allowed) {
      return new NextResponse('rate_limited', {
        status: 429,
        headers: { 'Retry-After': String(rl.resetSec) }
      });
    }

    const { id } = await params;
    const result = await getLatestAnalysis(tenantId, id);
    if (!result) {
      return new NextResponse('not_found', { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/spectra/[id]/analysis error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', {
      status: 500
    });
  }
}
