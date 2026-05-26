// @r181-11-applied: Firestore/Storage path measurements → spectra
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
 * R164 R164-phase-5b-2: moved from /api/spectra/* → /api/measurements/*.
 * R164 R164-phase-5b-1: backend now reads from measurements collection (URL unchanged).
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromToken, getRoleFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { publishSpectrumAnalysis } from '@/lib/pubsub/topics/measurement-analysis'; // R168-3.1b
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { SpectrumMetadata } from '@/types/spectra';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new NextResponse('unauthorized', { status: 401 });
    }
    const decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
    const tenantId = getTenantIdFromToken(decoded);
    const uid = decoded.uid;
    const role = getRoleFromToken(decoded);
    if (role === 'viewer' || role === null) {
      return new NextResponse('forbidden_viewer', { status: 403 });
    }
    if (!tenantId) {
      return new NextResponse('no_tenant', { status: 403 });
    }

    // R162-security — per-tenant rate limit
    const rl = await checkRateLimit(rateLimitKey('reanalyze', `${tenantId}:${uid}`), 5, 60);
    if (!rl.allowed) {
      return new NextResponse('rate_limited', {
        status: 429,
        headers: { 'Retry-After': String(rl.resetSec) }
      });
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

    // R213: accept optional updated measurement parameters (e.g. electrochemistry
    // metadata) to merge into the spectrum doc BEFORE re-analysis, so the worker
    // recomputes with the new conditions. Whitelist keys — never trust arbitrary
    // client fields into the doc.
    const ALLOWED_META_KEYS = new Set([
      'electrodeArea',
      'referenceElectrode',
      'pH',
      'reaction',
      'irCorrected',
      'scanRate',
      'nElectrons',
      'temperatureK'
    ]);
    let metaUpdate: Record<string, unknown> = {};
    try {
      const body = (await req.json()) as { metadata?: Record<string, unknown> } | null;
      if (body?.metadata && typeof body.metadata === 'object') {
        for (const [k, v] of Object.entries(body.metadata)) {
          if (ALLOWED_META_KEYS.has(k) && v !== undefined) metaUpdate[k] = v;
        }
      }
    } catch {
      metaUpdate = {}; // no/invalid body → plain re-analyze
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
        ...metaUpdate,
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
      return new NextResponse(`publish_failed: ${errMsg.substring(0, 200)}`, {
        status: 502
      });
    }
  } catch (err) {
    console.error('POST /api/spectra/[id]/reanalyze error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', {
      status: 500
    });
  }
}
