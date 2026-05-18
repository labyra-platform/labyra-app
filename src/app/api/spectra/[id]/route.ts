/**
 * DELETE /api/spectra/[id]
 *
 * Deletes spectrum doc + raw file. Raw is normally immutable, but full delete
 * is allowed (data ownership).
 *
 * @phase R160-spectra-1
 * R164 R164-phase-5b-1: backend now reads from measurements collection (URL unchanged).
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { deleteFile } from '@/lib/firebase/storage';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import type { SpectrumMetadata } from '@/types/spectra';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    // R162-tier-rate-limit — per-tenant rate limit
    const rl = await checkRateLimit(rateLimitKey('spectra-delete', tenantId), 30, 60);
    if (!rl.allowed) {
      return new NextResponse('rate_limited', {
        status: 429,
        headers: { 'Retry-After': String(rl.resetSec) }
      });
    }

    const db = getAdminFirestoreService();
    const ref = db.doc(`tenants/${tenantId}/measurements/${id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return new NextResponse('not_found', { status: 404 });
    }
    const data = snap.data() as SpectrumMetadata;
    const gsPath = data.storage.raw.replace(/^gs:\/\/[^/]+\//, '');

    // Best effort: delete file (don't block if file already gone)
    try {
      await deleteFile(gsPath);
      if (data.storage.processed) {
        const processedPath = data.storage.processed.replace(/^gs:\/\/[^/]+\//, '');
        await deleteFile(processedPath);
      }
      if (data.storage.thumbnail) {
        const thumbPath = data.storage.thumbnail.replace(/^gs:\/\/[^/]+\//, '');
        await deleteFile(thumbPath);
      }
    } catch (e) {
      console.error('delete storage files error', e);
    }

    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/spectra error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', {
      status: 500
    });
  }
}
