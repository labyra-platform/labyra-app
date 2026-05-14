/**
 * /api/analyses — list + create analysis.
 *
 * @phase R164-phase-4b
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import { CreateAnalysisSchema } from '@/lib/schemas/analysis-schema';
import { listAnalyses, createAnalysis } from '@/lib/firebase/analyses/service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('analyses-read', auth.tenantId), 100, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  const includeDeprecated = req.nextUrl.searchParams.get('includeDeprecated') === 'true';
  const includeRetracted = req.nextUrl.searchParams.get('includeRetracted') === 'true';
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : undefined;

  try {
    const items = await listAnalyses(auth.tenantId, { includeDeprecated, includeRetracted, limit });
    return NextResponse.json({ items });
  } catch (err) {
    console.error('GET /api/analyses', err);
    return new NextResponse('list_failed', { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('analyses-write', auth.tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  const body = await req.json();
  const parsed = CreateAnalysisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const item = await createAnalysis(parsed.data, {
      tenantId: auth.tenantId,
      createdBy: auth.uid
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error('POST /api/analyses', err);
    return new NextResponse('create_failed', { status: 500 });
  }
}
