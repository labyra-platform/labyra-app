/**
 * GET /api/structures/[id]/scene — build a Three.js render scene (atoms + bonds)
 * for a stored crystal structure via the worker /dft/structure/scene gateway.
 * Auth + tenant required.
 *
 * @phase R327-structure-viewer
 */
import { NextResponse } from 'next/server';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { buildStructureScene } from '@/lib/dft/worker-client';
import { getCrystalStructure } from '@/lib/firebase/crystal-structures/service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const { id } = await params;
  const cs = await getCrystalStructure(tenantId, id);
  if (!cs) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await buildStructureScene(cs.structure);
  if (!result.ok) {
    const data = result.data as { detail?: string } | null;
    return NextResponse.json({ error: data?.detail ?? 'Scene build failed' }, { status: 502 });
  }
  return NextResponse.json(result.data);
}
