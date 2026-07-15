/**
 * GET    /api/chemicals/[id] — detail (authed).
 * PATCH  /api/chemicals/[id] — update (writer+).
 * DELETE /api/chemicals/[id] — deprecate (writer+, soft).
 * @phase CHEM-1
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate, authenticateWriter } from '@/lib/api/auth-helper';
import { featureBlockedResponse } from '@/lib/api/feature-access';
import { chemicalFormSchema } from '@/features/chemicals/schema';
import { deprecateChemical, getChemical, updateChemical } from '@/lib/firebase/chemicals/service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const gated = await featureBlockedResponse(auth, 'chemicals');
  if (gated) return gated;
  const { id } = await ctx.params;
  const chem = await getChemical(auth.tenantId, id);
  if (!chem) return new NextResponse('not_found', { status: 404 });
  return NextResponse.json(chem);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  const gated = await featureBlockedResponse(auth, 'chemicals');
  if (gated) return gated;
  const { id } = await ctx.params;
  let parsed;
  try {
    parsed = chemicalFormSchema.partial().parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  try {
    await updateChemical(auth.tenantId, id, {
      ...parsed,
      casNumber: parsed.casNumber || undefined
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'update_failed';
    return NextResponse.json({ error: msg }, { status: msg === 'chemical_not_found' ? 404 : 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  const gated = await featureBlockedResponse(auth, 'chemicals');
  if (gated) return gated;
  const { id } = await ctx.params;
  try {
    await deprecateChemical(auth.tenantId, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'deprecate_failed';
    return NextResponse.json({ error: msg }, { status: msg === 'chemical_not_found' ? 404 : 500 });
  }
}
