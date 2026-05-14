/**
 * POST /api/spectra/notify-complete
 *
 * Body: { spectrumId, storagePath, originalFilename, mimeType, sizeBytes, sha256,
 *         spectrumType, experimentId, sampleId, sampleLabel?, instrument?, measuredAt }
 *
 * After client uploads bytes via signed URL, creates the Firestore metadata doc.
 * Verifies file exists in Storage; verifies sha256 client-side (server can later re-verify async).
 *
 * @phase R160-spectra-1
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { publishSpectrumAnalysis } from '@/lib/pubsub/publisher';
import { fileExists, getFileMetadata } from '@/lib/firebase/storage';
import { SPECTRA_CONFIG } from '@/lib/spectra/config';
import type { SpectrumMetadata, SpectrumType } from '@/types/spectra';
import { getTenantIdFromToken } from '@/lib/auth/token';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const {
      spectrumId,
      storagePath,
      originalFilename,
      mimeType,
      sizeBytes,
      sha256,
      spectrumType,
      experimentId,
      sampleId,
      sampleLabel,
      chemicalFormula,
      anode,
      monochromator,
      profileFunction,
      zeroShift,
      instrument,
      measuredAt
    } = body;

    if (!spectrumId || !storagePath || !sha256 || !spectrumType) {
      return new NextResponse('missing_required_field', { status: 400 });
    }

    // Path must start with tenant prefix (guard)
    const expectedPrefix = `tenants/${tenantId}/spectra/${spectrumId}/raw/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      return new NextResponse('path_tenant_mismatch', { status: 403 });
    }

    // Verify upload actually completed
    if (!(await fileExists(storagePath))) {
      return new NextResponse('file_not_found_in_storage', { status: 404 });
    }

    // Compare stored size vs reported size (basic tampering check)
    const fileMeta = await getFileMetadata(storagePath);
    const actualSize = Number(fileMeta.size ?? 0);
    if (Math.abs(actualSize - sizeBytes) > 1024) {
      return new NextResponse('size_mismatch', { status: 422 });
    }

    const config = SPECTRA_CONFIG[spectrumType as SpectrumType];
    if (!config) {
      return new NextResponse('invalid_spectrum_type', { status: 400 });
    }

    const now = Date.now();
    const metadata: SpectrumMetadata = {
      schemaVersion: 1,
      id: spectrumId,
      tenantId,
      experimentId,
      sampleId,
      sampleLabel: sampleLabel ?? undefined,
      chemicalFormula: chemicalFormula ?? undefined,
      anode: anode ?? undefined,
      monochromator: monochromator ?? undefined,
      profileFunction: profileFunction ?? undefined,
      zeroShift: typeof zeroShift === 'number' ? zeroShift : undefined,
      spectrumType: spectrumType as SpectrumType,
      group: config.group,
      storage: {
        raw: `gs://${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? ''}/${storagePath}`
      },
      originalFilename,
      mimeType: mimeType ?? 'application/octet-stream',
      sizeBytes,
      sha256,
      instrument,
      operator: decoded.uid,
      measuredAt: typeof measuredAt === 'number' ? measuredAt : now,
      status: 'uploaded',
      createdAt: now,
      updatedAt: now,
      createdBy: decoded.uid
    };

    const db = getAdminFirestoreService();
    await db.doc(`tenants/${tenantId}/spectra/${spectrumId}`).set(metadata);

    // R160-spectra-3b: publish analysis task to worker.
    // On failure, spectrum stays 'uploaded' for manual retry.
    let queueStatus: 'uploaded' | 'queued' = 'uploaded';
    let publishError: string | undefined;
    try {
      const messageId = await publishSpectrumAnalysis({
        tenantId,
        spectrumId,
        spectrumType: spectrumType as SpectrumType,
        experimentId
      });
      await db.doc(`tenants/${tenantId}/spectra/${spectrumId}`).update({
        status: 'queued',
        updatedAt: Date.now(),
        debugMessageId: messageId
      });
      queueStatus = 'queued';
    } catch (pubErr) {
      publishError = pubErr instanceof Error ? pubErr.message : String(pubErr);
      console.error('Pub/Sub publish failed:', publishError);
      // Write the error to Firestore so we can see it in the UI
      try {
        await db.doc(`tenants/${tenantId}/spectra/${spectrumId}`).update({
          status: 'failed',
          errorMessage: `publish: ${publishError.substring(0, 400)}`,
          updatedAt: Date.now()
        });
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ id: spectrumId, status: queueStatus, publishError });
  } catch (err) {
    console.error('POST /api/spectra/notify-complete error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', { status: 500 });
  }
}
