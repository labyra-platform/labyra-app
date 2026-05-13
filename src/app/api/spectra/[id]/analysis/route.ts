/**
 * GET /api/spectra/[id]/analysis
 * Returns the latest AnalysisResult for a spectrum.
 * @phase R160-spectra-3b
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthService } from '@/lib/firebase/admin';
import { getLatestAnalysis } from '@/lib/firestore/queries/spectra-analysis';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new NextResponse('unauthorized', { status: 401 });
    }
    const decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
    const tenantId = decoded.tenantId as string | undefined;
    if (!tenantId) {
      return new NextResponse('no_tenant', { status: 403 });
    }

    const { id } = await params;
    const result = await getLatestAnalysis(tenantId, id);
    if (!result) {
      return new NextResponse('not_found', { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/spectra/[id]/analysis error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', { status: 500 });
  }
}
