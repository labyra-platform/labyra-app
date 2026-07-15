/**
 * GET /api/references/[id]/versions — list version history.
 *
 * @phase R164-phase-4b
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { featureBlockedResponse } from '@/lib/api/feature-access';
import { listReferenceVersions } from '@/lib/firebase/references/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const gated = await featureBlockedResponse(auth, 'references');
  if (gated) return gated;

  const rl = await checkRateLimit(rateLimitKey('references-read', auth.tenantId), 100, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  try {
    const versions = await listReferenceVersions(auth.tenantId, id);
    return NextResponse.json({ versions });
  } catch (err) {
    console.error('GET /api/references/[id]/versions', err);
    return new NextResponse('list_versions_failed', { status: 500 });
  }
}
