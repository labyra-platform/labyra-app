/**
 * POST /api/spectra/signed-upload
 *
 * Body: { spectrumType, originalFilename, mimeType, sizeBytes, experimentId, sampleId }
 *
 * Returns: { spectrumId, signedUrl, storagePath, expiresAt }
 *
 * Client then PUTs the file directly to signedUrl, computes sha256,
 * then calls /api/spectra/notify-complete with { spectrumId, sha256, measuredAt }.
 *
 * @phase R160-spectra-1
 * R164 R164-phase-5b-2: moved from /api/spectra/* → /api/measurements/*.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthService } from '@/lib/firebase/admin';
// R164-phase-5b-1: route URL stays /api/spectra/* until Phase 5b-2; collection switched to measurements
import { measurementRawPath, getSignedUploadUrl } from '@/lib/firebase/storage';
import { SPECTRA_CONFIG } from '@/lib/spectra/config';
import type { SpectrumType } from '@/types/spectra';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

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

    // R162-security — per-tenant rate limit
    const rl = await checkRateLimit(rateLimitKey('signed-upload', tenantId), 30, 60);
    if (!rl.allowed) {
      return new NextResponse('rate_limited', {
        status: 429,
        headers: { 'Retry-After': String(rl.resetSec) }
      });
    }

    const body = await req.json();
    const { spectrumType, originalFilename, mimeType, sizeBytes, experimentId, sampleId } =
      body as {
        spectrumType: SpectrumType;
        originalFilename: string;
        mimeType: string;
        sizeBytes: number;
        experimentId: string;
        sampleId: string;
      };

    if (!spectrumType || !originalFilename || !experimentId || !sampleId) {
      return new NextResponse('missing_required_field', { status: 400 });
    }

    const config = SPECTRA_CONFIG[spectrumType];
    if (!config) {
      return new NextResponse('invalid_spectrum_type', { status: 400 });
    }

    if (sizeBytes > config.maxSizeBytes) {
      return new NextResponse(
        `file_too_large: max ${Math.floor(config.maxSizeBytes / (1024 * 1024))}MB for ${spectrumType}`,
        { status: 413 }
      );
    }

    // Verify extension
    const ext = (originalFilename.match(/\.[^.]+$/) ?? [''])[0].toLowerCase();
    if (!config.acceptedExtensions.includes(ext)) {
      return new NextResponse(
        `invalid_extension: ${ext} not in ${config.acceptedExtensions.join(', ')}`,
        { status: 400 }
      );
    }

    const measurementId = randomUUID();
    const storagePath = measurementRawPath(tenantId, measurementId, originalFilename);
    const signedUrl = await getSignedUploadUrl(storagePath, mimeType);

    return NextResponse.json({
      measurementId,
      spectrumId: measurementId, // legacy alias for older clients
      signedUrl,
      storagePath,
      expiresAt: Date.now() + 15 * 60 * 1000
    });
  } catch (err) {
    console.error('POST /api/spectra/signed-upload error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', { status: 500 });
  }
}
