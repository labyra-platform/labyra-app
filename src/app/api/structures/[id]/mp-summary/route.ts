/**
 * GET /api/structures/[id]/mp-summary — Materials Project summary (band gap,
 * energy above hull, formation energy, magnetic ordering, …) for an mp-sourced
 * structure. Cached on the doc after first fetch. Auth + tenant. @phase R389
 */
import { NextResponse } from 'next/server';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { fetchStructureMpSummary } from '@/lib/dft/worker-client';
import { attachMpSummary, getCrystalStructure } from '@/lib/firebase/crystal-structures/service';
import type { MpSummary } from '@/types/crystal-structure';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const { id } = await params;
  const cs = await getCrystalStructure(tenantId, id);
  if (!cs) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!cs.mpId) return NextResponse.json({ error: 'No mp-id' }, { status: 404 });

  if (cs.mpSummary) return NextResponse.json(cs.mpSummary);

  const result = await fetchStructureMpSummary(cs.mpId);
  const data = result.data as (MpSummary & { error?: string }) | null;
  if (!result.ok || !data || data.error) {
    return NextResponse.json({ error: data?.error ?? 'MP fetch failed' }, { status: 502 });
  }
  await attachMpSummary(tenantId, id, data).catch(() => {});
  return NextResponse.json(data);
}
