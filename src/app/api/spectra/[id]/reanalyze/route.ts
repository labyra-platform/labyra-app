/**
 * POST /api/spectra/[id]/reanalyze
 *
 * Re-trigger analysis on existing spectrum (e.g. after worker version upgrade).
 * Re-publishes Pub/Sub message; worker reprocesses raw file from storage.
 *
 * Security:
 * - Firebase auth required
 * - Tenant isolation: only spectra in caller's tenant
 * - State guard: only completed/failed spectra can be re-analyzed
 *
 * @phase R161-xrd-detail (re-analyze for backfill)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { publishSpectrumAnalysis } from '@/lib/pubsub/publisher';
import type { SpectrumMetadata } from '@/types/spectra';
import { getTenantIdFromToken } from '@/lib/auth/token';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id: spectrumId } = await params;
    if (!spectrumId || spectrumId.length > 100) {
      return new NextResponse('invalid_id', { status: 400 });
    }

    const db = getAdminFirestoreService();
    const ref = db.doc(`tenants/${tenantId}/spectra/${spectrumId}`);
    const snap = await ref.get();

    if (!snap.exists) {
      return new NextResponse('not_found', { status: 404 });
    }
    const spectrum = snap.data() as SpectrumMetadata;

    // Defense in depth: verify tenant
    if (spectrum.tenantId !== tenantId) {
      return new NextResponse('tenant_mismatch', { status: 403 });
    }

    // Allow re-analyze only for completed states (avoid clobbering in-flight)
    const allowedStates = ['analyzed', 'failed', 'uploaded'];
    if (!allowedStates.includes(spectrum.status)) {
      return NextResponse.json(
        { error: 'invalid_state', currentStatus: spectrum.status },
        { status: 409 }
      );
    }

    // Re-publish analysis task
    try {
      const messageId = await publishSpectrumAnalysis({
        tenantId,
        spectrumId,
        spectrumType: spectrum.spectrumType,
        experimentId: spectrum.experimentId
      });
      await ref.update({
        status: 'queued',
        errorMessage: null,
        debugMessageId: messageId,
        updatedAt: Date.now()
      });
      return NextResponse.json({ id: spectrumId, status: 'queued', messageId });
    } catch (pubErr) {
      const errMsg = pubErr instanceof Error ? pubErr.message : String(pubErr);
      console.error('Re-analyze publish failed:', errMsg);
      await ref.update({
        status: 'failed',
        errorMessage: `reanalyze publish: ${errMsg.substring(0, 400)}`,
        updatedAt: Date.now()
      });
      return new NextResponse(`publish_failed: ${errMsg.substring(0, 200)}`, { status: 502 });
    }
  } catch (err) {
    console.error('POST /api/spectra/[id]/reanalyze error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', { status: 500 });
  }
}
