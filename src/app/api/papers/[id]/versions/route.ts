/**
 * GET /api/papers/[id]/versions — list version history.
 *
 * @phase R164-phase-4b
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { listPaperVersions } from '@/lib/firebase/papers/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('papers-read', auth.tenantId), 100, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  try {
    const versions = await listPaperVersions(auth.tenantId, id);
    return NextResponse.json({ versions });
  } catch (err) {
    console.error('GET /api/papers/[id]/versions', err);
    return new NextResponse('list_versions_failed', { status: 500 });
  }
}
