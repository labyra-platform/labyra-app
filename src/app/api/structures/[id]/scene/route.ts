/**
 * GET /api/structures/[id]/scene — Three.js render scene (atoms + bonds) for a
 * stored crystal structure. Served from the precomputed scene cached on the doc
 * (instant); legacy structures without one are built via the worker
 * /dft/structure/scene gateway once and cached for next time. Auth + tenant.
 *
 * @phase R327-structure-viewer
 */
import { NextResponse } from 'next/server';
import { getCurrentTenantId, getCurrentUser } from '@/lib/auth/server';
import { buildStructureScene, type StructureScene } from '@/lib/dft/worker-client';
import { attachScene, getCrystalStructure } from '@/lib/firebase/crystal-structures/service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const { id } = await params;
  const cs = await getCrystalStructure(tenantId, id);
  if (!cs) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Precomputed at import — no worker round-trip.
  if (cs.scene) return NextResponse.json(cs.scene);

  // Legacy structure (imported before scenes were cached): build once + backfill.
  const result = await buildStructureScene(cs.structure);
  if (!result.ok) {
    const data = result.data as { detail?: string } | null;
    return NextResponse.json({ error: data?.detail ?? 'Scene build failed' }, { status: 502 });
  }
  const scene = result.data as StructureScene;
  await attachScene(tenantId, id, scene).catch(() => {});
  return NextResponse.json(scene);
}
