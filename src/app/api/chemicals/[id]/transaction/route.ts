/**
 * POST /api/chemicals/[id]/transaction — apply inventory transaction (writer+).
 * Body: { type: 'consume'|'replenish'|'adjust', amount: number, reason?, experimentId? }
 *
 * GET /api/chemicals/[id]/transaction — list transaction history (authed).
 * @phase CHEM-1
 */
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, authenticateWriter } from '@/lib/api/auth-helper';
import { featureBlockedResponse } from '@/lib/api/feature-access';
import { applyTransaction, listTransactions } from '@/lib/firebase/chemicals/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const TxSchema = z.object({
  type: z.enum(['consume', 'replenish', 'adjust']),
  amount: z.number().positive().max(1_000_000),
  reason: z.string().max(500).optional(),
  experimentId: z.string().max(128).optional()
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  const gated = await featureBlockedResponse(auth, 'chemicals');
  if (gated) return gated;
  const { id } = await ctx.params;
  const rl = await checkRateLimit(rateLimitKey('chem-tx', `${auth.tenantId}:${auth.uid}`), 60, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }
  let parsed;
  try {
    parsed = TxSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  try {
    const result = await applyTransaction(auth.tenantId, id, parsed, auth.uid);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'tx_failed';
    const status = msg === 'chemical_not_found' ? 404 : msg === 'insufficient_quantity' ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const gated = await featureBlockedResponse(auth, 'chemicals');
  if (gated) return gated;
  const { id } = await ctx.params;
  try {
    const items = await listTransactions(auth.tenantId, id);
    return NextResponse.json({ items });
  } catch (err) {
    console.error('GET chem transactions', err);
    return new NextResponse('list_failed', { status: 500 });
  }
}
