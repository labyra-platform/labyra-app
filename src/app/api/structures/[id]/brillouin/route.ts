/**
 * GET /api/structures/[id]/brillouin — first Brillouin zone (facets) + high-
 * symmetry k-points + band path for the reciprocal-space viewer. Built via the
 * worker /dft/structure/brillouin gateway once and cached on the doc. @phase R398
 */
import { NextResponse } from 'next/server';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { fetchBrillouinZone, type BrillouinZone } from '@/lib/dft/worker-client';
import { attachBrillouin, getCrystalStructure } from '@/lib/firebase/crystal-structures/service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const { id } = await params;
  const cs = await getCrystalStructure(tenantId, id);
  if (!cs) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (cs.brillouin) return NextResponse.json(cs.brillouin);

  const result = await fetchBrillouinZone(cs.structure);
  if (!result.ok) {
    const data = result.data as { detail?: string } | null;
    return NextResponse.json({ error: data?.detail ?? 'Brillouin build failed' }, { status: 502 });
  }
  const bz = result.data as BrillouinZone;
  await attachBrillouin(tenantId, id, bz).catch(() => {});
  return NextResponse.json(bz);
}
