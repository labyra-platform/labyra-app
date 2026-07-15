/**
 * POST /api/chemicals/[id]/reactivate — undo deprecation (writer+).
 * @phase R210
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticateWriter } from '@/lib/api/auth-helper';
import { featureBlockedResponse } from '@/lib/api/feature-access';
import { reactivateChemical } from '@/lib/firebase/chemicals/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  const gated = await featureBlockedResponse(auth, 'chemicals');
  if (gated) return gated;
  const rl = await checkRateLimit(rateLimitKey('chemicals-reactivate', auth.tenantId), 30, 60);
  if (!rl.allowed) return new NextResponse('rate_limited', { status: 429 });
  const { id } = await ctx.params;
  try {
    await reactivateChemical(auth.tenantId, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'reactivate_failed';
    return NextResponse.json({ error: msg }, { status: msg === 'chemical_not_found' ? 404 : 500 });
  }
}
